const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const storage = require('./src/data/storage');
const fetcher = require('./src/data/fetcher');
const scheduler = require('./src/data/scheduler');
const { getRecommendations } = require('./src/engine/rules');
const { UNIVERSE, filterForStrategy } = require('./src/data/universe');

// ── Paths ─────────────────────────────────────────────────────
// Strategy lives in Knowbase so it's queryable via the LLM
const KNOWBASE_APP_DIR = path.join(os.homedir(), 'Documents', 'knowbase', 'apps', 'sharebasePro');
const STRATEGY_FILE    = path.join(KNOWBASE_APP_DIR, 'strategy.json');
const WATCHLIST_FILE   = path.join(os.homedir(), 'Documents', 'knowbase', 'shares', 'watchlist.md');
const PROMPTS_DIR      = path.join(KNOWBASE_APP_DIR, 'prompts');

// Config (API keys, preferences) lives in Electron userData — never in git
function getConfigFile() { return path.join(app.getPath('userData'), 'config.json'); }

let mainWindow = null;

function createWindow(file, opts = {}) {
  const win = new BrowserWindow({
    width: opts.width || 1280,
    height: opts.height || 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#0f1117'
  });
  win.loadFile(file);
  return win;
}

function strategyExists() {
  return fs.existsSync(STRATEGY_FILE);
}

function loadStrategy() {
  return JSON.parse(fs.readFileSync(STRATEGY_FILE, 'utf8'));
}

function loadConfig() {
  const f = getConfigFile();
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; }
}

function saveConfig(cfg) {
  fs.writeFileSync(getConfigFile(), JSON.stringify(cfg, null, 2));
}

// Parse tickers from watchlist.md.
// Supports both Claude response format (## Watchlist section) and plain bullet lists.
// Tickers may be alphanumeric (e.g. W7L.L) with an optional .L suffix.
function readWatchlistFile() {
  if (!fs.existsSync(WATCHLIST_FILE)) return null;
  const text = fs.readFileSync(WATCHLIST_FILE, 'utf8');

  // If there's a ## Watchlist section, use only what comes after that heading
  const headingIdx = text.search(/^##\s*Watchlist/im);
  const source = headingIdx >= 0
    ? text.slice(text.indexOf('\n', headingIdx) + 1)  // everything after the heading line
    : text;

  const tickers = source
    .split('\n')
    .map(l => l.replace(/^[-*\s]+/, '').trim().toUpperCase())
    .filter(l => /^[A-Z0-9]{1,6}(\.L)?$/.test(l));

  return tickers.length ? tickers : null;
}

// Priority: watchlist.md file → strategy.watchlist → filtered universe
function getActiveUniverse(strategy) {
  const tickers = readWatchlistFile() || strategy.watchlist || null;
  if (tickers?.length) {
    return tickers.map(ticker =>
      UNIVERSE.find(u => u.ticker === ticker) ||
      { ticker, name: ticker, market: ticker.endsWith('.L') ? 'UK' : 'US', sector: null, marketCap: 'large' }
    );
  }
  return filterForStrategy(strategy);
}

app.whenReady().then(() => {
  // Ensure all data directories exist
  [KNOWBASE_APP_DIR, PROMPTS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // Initialise storage with userData path (stocks cache + preferences)
  storage.init(app.getPath('userData'));

  if (strategyExists()) {
    mainWindow = createWindow('src/dashboard/dashboard.html');
    const strategy = loadStrategy();
    scheduler.start(strategy, msg => mainWindow?.webContents.send('fetch-status', msg), getActiveUniverse, loadConfig);
  } else {
    mainWindow = createWindow('src/interview/interview.html', { width: 720, height: 680 });
  }
});

app.on('window-all-closed', () => {
  scheduler.stop();
  app.quit();
});

// ── Strategy ──────────────────────────────────────────────────

ipcMain.handle('save-strategy', async (_e, strategy) => {
  fs.writeFileSync(STRATEGY_FILE, JSON.stringify(strategy, null, 2));
  if (mainWindow) mainWindow.close();
  mainWindow = createWindow('src/dashboard/dashboard.html');
  scheduler.start(strategy, msg => mainWindow?.webContents.send('fetch-status', msg), getActiveUniverse, loadConfig);

  // Auto-fetch immediately after interview — uses Claude watchlist if present
  const tickers = getActiveUniverse(strategy).map(s => s.ticker);
  mainWindow.webContents.once('did-finish-load', async () => {
    mainWindow?.webContents.send('fetch-status', `Fetching ${tickers.length} stocks for your profile…`);
    await runFetch(tickers);
  });
  return { ok: true };
});

ipcMain.handle('load-strategy', async () => {
  if (!strategyExists()) return null;
  return loadStrategy();
});

// ── Data fetch ────────────────────────────────────────────────

async function runFetch(tickers) {
  const { results, paused, failureCount } = await fetcher.fetchAll(
    tickers,
    msg => mainWindow?.webContents.send('fetch-status', msg),
    makeDebugCb(),
    loadConfig(),
  );
  if (paused) {
    mainWindow?.webContents.send('fetch-paused', { failureCount });
  } else {
    mainWindow?.webContents.send('fetch-complete');
  }
  return results;
}

ipcMain.handle('fetch-now', async () => {
  if (!strategyExists()) return { error: 'No strategy set' };
  const strategy = loadStrategy();
  const tickers  = getActiveUniverse(strategy).map(s => s.ticker);
  mainWindow?.webContents.send('fetch-status', `Fetching ${tickers.length} stocks…`);
  return runFetch(tickers);
});

ipcMain.handle('retry-fetch', async () => {
  if (!strategyExists()) return { error: 'No strategy set' };
  const strategy = loadStrategy();
  const tickers  = getActiveUniverse(strategy).map(s => s.ticker);
  mainWindow?.webContents.send('fetch-status', `Retrying fetch for ${tickers.length} stocks…`);
  return runFetch(tickers);
});

ipcMain.handle('get-stock-data', async (_e, ticker) => {
  return storage.getLatestForTicker(ticker);
});

// ── Recommendations ───────────────────────────────────────────

ipcMain.handle('get-recommendations', async () => {
  if (!strategyExists()) return [];
  const strategy = loadStrategy();
  const universe = getActiveUniverse(strategy);
  const prefs    = storage.getPrefs();

  const results = [];
  for (const stock of universe) {
    const data = storage.getLatestForTicker(stock.ticker);
    if (data) {
      const rec = getRecommendations(data, strategy);
      results.push({
        ...stock,
        ...rec,
        starred: prefs.starred.includes(stock.ticker),
        dismissed: prefs.dismissed.includes(stock.ticker),
      });
    }
  }
  return results.sort((a, b) => {
    // Starred first, then by score
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.score - a.score;
  });
});

ipcMain.handle('get-universe', () => {
  if (!strategyExists()) return [];
  return getActiveUniverse(loadStrategy());
});

// ── Preferences ───────────────────────────────────────────────

ipcMain.handle('star-ticker',       (_e, ticker) => { storage.starTicker(ticker); });
ipcMain.handle('unstar-ticker',     (_e, ticker) => { storage.unstarTicker(ticker); });
ipcMain.handle('dismiss-ticker',    (_e, ticker) => { storage.dismissTicker(ticker); });
ipcMain.handle('reset-dismissed',   ()           => { storage.resetDismissed(); });

// ── Debug helper ─────────────────────────────────────────────

function makeDebugCb() {
  const cfg = loadConfig();
  if (!cfg.debugMode) return null;
  return entry => mainWindow?.webContents.send('debug-event', entry);
}

// ── App config ────────────────────────────────────────────────

const CONFIG_DEFAULTS = {
  ollamaUrl:           'http://localhost:11434',
  ollamaModel:         'gemma4:latest',
  apiFailureThreshold: 3,
};

ipcMain.handle('save-config', (_e, cfg) => {
  saveConfig({ ...loadConfig(), ...cfg });
});

ipcMain.handle('load-config', () => {
  const cfg = loadConfig();
  return {
    ollamaUrl:           cfg.ollamaUrl          || CONFIG_DEFAULTS.ollamaUrl,
    ollamaModel:         cfg.ollamaModel         || CONFIG_DEFAULTS.ollamaModel,
    apiFailureThreshold: cfg.apiFailureThreshold != null ? Number(cfg.apiFailureThreshold) : CONFIG_DEFAULTS.apiFailureThreshold,
    debugMode:           !!cfg.debugMode,
  };
});

// ── AI Analysis via Ollama ────────────────────────────────────

ipcMain.handle('get-ai-analysis', async (_e, { ticker, stockData, rec, strategy }) => {
  const cfg = loadConfig();
  const url   = cfg.ollamaUrl   || CONFIG_DEFAULTS.ollamaUrl;
  const model = cfg.ollamaModel || CONFIG_DEFAULTS.ollamaModel;
  const prompt = buildAnalysisPrompt(ticker, stockData, rec, strategy);

  const debugCb  = makeDebugCb();
  const t0       = Date.now();
  const request  = { url: `${url}/api/chat`, model, promptLength: prompt.length };

  try {
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      debugCb?.({ id: `${Date.now()}`, ts: new Date().toISOString(), type: 'ollama', label: `AI Analysis — ${ticker}`, request, response: { status: response.status, data: text }, error: `HTTP ${response.status}`, durationMs: Date.now() - t0 });
      mainWindow?.webContents.send('ai-done');
      return { error: `Ollama error ${response.status}: ${text}` };
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) {
            mainWindow?.webContents.send('ai-chunk', obj.message.content);
            fullResponse += obj.message.content;
          }
        } catch {}
      }
    }

    debugCb?.({ id: `${Date.now()}`, ts: new Date().toISOString(), type: 'ollama', label: `AI Analysis — ${ticker}`, request: { model, promptLength: prompt.length, promptPreview: prompt.slice(0, 200) + '…' }, response: { status: 200, chars: fullResponse.length, preview: fullResponse.slice(0, 300) + '…' }, error: null, durationMs: Date.now() - t0 });
    mainWindow?.webContents.send('ai-done');
    return { ok: true };
  } catch (err) {
    debugCb?.({ id: `${Date.now()}`, ts: new Date().toISOString(), type: 'ollama', label: `AI Analysis — ${ticker}`, request, response: null, error: err.message, durationMs: Date.now() - t0 });
    mainWindow?.webContents.send('ai-done');
    return { error: err.message };
  }
});

ipcMain.handle('analyse-debug', async (_e, { entries }) => {
  const cfg   = loadConfig();
  const url   = cfg.ollamaUrl   || CONFIG_DEFAULTS.ollamaUrl;
  const model = cfg.ollamaModel || CONFIG_DEFAULTS.ollamaModel;

  const summary = entries.map((e, i) =>
    `[${i + 1}] ${e.type.toUpperCase()} — ${e.label} (${e.durationMs}ms)${e.error ? '\nERROR: ' + e.error : ''}\nRequest: ${JSON.stringify(e.request, null, 2)}\nResponse: ${JSON.stringify(e.response, null, 2)}`
  ).join('\n\n---\n\n');

  const prompt = `You are a debugging assistant. Below are API request/response logs from a stock analysis app using RapidAPI (Yahoo Finance data) and Ollama (local LLM). Analyse the logs, identify any errors or anomalies, explain what is happening, and suggest fixes if needed. Be concise and specific.\n\n${summary}`;

  try {
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true }),
    });
    if (!response.ok) {
      mainWindow?.webContents.send('debug-ai-done');
      return { error: `Ollama ${response.status}` };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) mainWindow?.webContents.send('debug-ai-chunk', obj.message.content);
        } catch {}
      }
    }
    mainWindow?.webContents.send('debug-ai-done');
    return { ok: true };
  } catch (err) {
    mainWindow?.webContents.send('debug-ai-done');
    return { error: err.message };
  }
});

// ── Strategy review ───────────────────────────────────────────

ipcMain.handle('review-strategy', async (_e, strategy) => {
  const cfg   = loadConfig();
  const url   = cfg.ollamaUrl   || CONFIG_DEFAULTS.ollamaUrl;
  const model = cfg.ollamaModel || CONFIG_DEFAULTS.ollamaModel;
  const prompt = buildStrategyReviewPrompt(strategy);

  try {
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true }),
    });
    if (!response.ok) {
      mainWindow?.webContents.send('strategy-review-done', { error: `Ollama returned ${response.status}` });
      return { error: `Ollama ${response.status}` };
    }
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) mainWindow?.webContents.send('strategy-review-chunk', obj.message.content);
        } catch {}
      }
    }
    mainWindow?.webContents.send('strategy-review-done', {});
    return { ok: true };
  } catch (err) {
    mainWindow?.webContents.send('strategy-review-done', { error: err.message });
    return { error: err.message };
  }
});

function buildClaudePrompt(s, stocks) {
  const marketLabels  = { US: 'US Equities', UK: 'UK Equities', ETF: 'ETFs' };
  const riskLabels    = { conservative: 'Conservative', moderate: 'Moderate', aggressive: 'Aggressive' };
  const horizonLabels = { short: 'Short-term (0–6 months)', medium: 'Medium-term (6 months – 2 years)', long: 'Long-term (2+ years)' };
  const capLabels     = { large: 'Large-cap (>£/$10bn)', mid: 'Mid-cap (£/$2bn–10bn)', small: 'Small-cap (<£/$2bn)', any: 'All sizes' };

  const rsiBuy    = { conservative: 40, moderate: 45, aggressive: 55 }[s.risk] || 45;
  const rsiSell   = { conservative: 65, moderate: 70, aggressive: 75 }[s.risk] || 70;
  const isMedLong = s.horizon === 'medium' || s.horizon === 'long';
  const isLong    = s.horizon === 'long';
  const hasDividend = (s.stockTypes || []).includes('dividend');

  const stockLines = stocks.map(st =>
    `- ${st.ticker.replace(/\.L$/, '')} (${st.name}) — ${st.market}, ${st.sector || 'Multi-sector'}, ${st.marketCap}-cap`
  ).join('\n');

  const fundamentalLines = isMedLong ? [
    `- P/E ratio < 20: bullish +${isLong ? 20 : 10} pts`,
    hasDividend ? `- Dividend yield > 3%: bullish +10 pts` : null,
    `- Earnings growth > 10% YoY: bullish +${isLong ? 15 : 8} pts`,
  ].filter(Boolean).join('\n') : '- Not applied (short-term horizon — technicals only)';

  return [
    'You are an expert financial analyst. An investor has configured their strategy in a stock analysis app and needs you to review their stock universe and identify the best opportunities.',
    '',
    '## Investor Strategy',
    `- Markets: ${(s.markets || []).map(m => marketLabels[m] || m).join(', ')}`,
    `- Risk tolerance: ${riskLabels[s.risk] || s.risk}`,
    `- Investment horizon: ${horizonLabels[s.horizon] || s.horizon}`,
    `- Stock types of interest: ${(s.stockTypes || []).join(', ')}`,
    `- Sectors: ${s.sectors?.length ? s.sectors.join(', ') : 'All sectors'}`,
    `- Market cap preference: ${capLabels[s.marketCap] || s.marketCap}`,
    '',
    '## Scoring Rules (used by the app)',
    'Technical signals (always applied):',
    `- RSI oversold (< ${rsiBuy}): bullish +20 pts`,
    `- RSI overbought (> ${rsiSell}): bearish −20 pts`,
    `- MACD histogram positive + MACD above signal line: bullish +20 pts`,
    `- MACD histogram negative: bearish −15 pts`,
    `- Golden Cross (50-day MA > 200-day MA): bullish +15 pts; Death Cross: bearish −15 pts`,
    `- Price above 50-day MA: bullish +10 pts; below: bearish −10 pts`,
    `- Volume spike (> 1.5× 20-day average): bullish +10 pts`,
    'Fundamental overlays:',
    fundamentalLines,
    `Final score: rule-based (60%) blended with ML pattern score (40%). BUY ≥ 60, SELL ≤ 35, HOLD otherwise.`,
    '',
    `## Stock Universe (${stocks.length} stocks matched to this strategy)`,
    stockLines,
    '',
    '## Your Task',
    'Based on current market conditions and your knowledge of these stocks:',
    '',
    '1. **Strategy fit assessment** — In 2–3 sentences, does this strategy make sense given current market conditions? Any tensions worth flagging?',
    '',
    `2. **Top picks (8–10 stocks)** — Which stocks from the universe above are most likely to score BUY under this strategy right now? For each, explain in 1–2 sentences why it fits and what specific signals to watch (referencing the scoring rules above).`,
    '',
    '3. **Stocks to avoid** — Which 2–3 from the universe are poor fits right now and why?',
    '',
    '4. **Portfolio construction note** — Given the strategy, how should the investor weight sectors and diversify across the picks?',
    '',
    'Be direct and specific. Reference actual indicator levels where you know them. No disclaimers.',
    '',
    '5. **Watchlist** — At the very end of your response, add the following section exactly as shown (it is machine-parsed by the app to set up live monitoring):',
    '',
    '## Watchlist',
    '- TICKER1',
    '- TICKER2',
    '',
    'List only your top picks from step 2, one per line, using the exact ticker symbol from the Stock Universe list above (including the .L suffix for UK stocks). No extra text in this section.',
  ].join('\n');
}

function buildStrategyReviewPrompt(s) {
  const marketLabels  = { US: 'US Equities', UK: 'UK Equities', ETF: 'ETFs' };
  const riskLabels    = { conservative: 'Conservative', moderate: 'Moderate', aggressive: 'Aggressive' };
  const horizonLabels = { short: 'Short-term (0–6 months)', medium: 'Medium-term (6 months – 2 years)', long: 'Long-term (2+ years)' };
  const capLabels     = { large: 'Large-cap (>£/$10bn)', mid: 'Mid-cap (£/$2bn–10bn)', small: 'Small-cap (<£/$2bn)', any: 'All sizes' };

  const rsiBuy  = { conservative: 40, moderate: 45, aggressive: 55 }[s.risk] || 45;
  const rsiSell = { conservative: 65, moderate: 70, aggressive: 75 }[s.risk] || 70;
  const isLong  = s.horizon === 'long';
  const isMedLong = s.horizon === 'medium' || s.horizon === 'long';
  const hasDividend = (s.stockTypes || []).includes('dividend');

  const scoringLines = [
    `Technical signals (always applied):`,
    `- RSI oversold (< ${rsiBuy}): bullish +20 pts`,
    `- RSI overbought (> ${rsiSell}): bearish −20 pts`,
    `- MACD histogram positive with MACD above signal line: bullish +20 pts`,
    `- MACD histogram negative: bearish −15 pts`,
    `- Golden Cross (50-day MA > 200-day MA): bullish +15 pts; Death Cross: bearish −15 pts`,
    `- Price above 50-day MA: bullish +10 pts; below: bearish −10 pts`,
    `- Recent volume > 1.5× average: bullish +10 pts`,
  ];

  if (isMedLong) {
    scoringLines.push(`Fundamental overlays (applied because horizon is ${s.horizon}):`);
    scoringLines.push(`- P/E ratio < 20: bullish +${isLong ? 20 : 10} pts`);
    if (hasDividend) scoringLines.push(`- Dividend yield > 3% (dividend type selected): bullish +10 pts`);
    scoringLines.push(`- Earnings growth > 10% YoY: bullish +${isLong ? 15 : 8} pts`);
  } else {
    scoringLines.push(`Fundamental overlays: not applied (short horizon — technicals only).`);
  }

  scoringLines.push(`Final score: rule-based score (60%) blended with an ML pattern score (40%). BUY if ≥ 60, SELL if ≤ 35, HOLD otherwise.`);

  return [
    'You are a financial strategy advisor. A user has configured their investment strategy profile in a stock analysis app. The app uses a specific rule-based scoring engine. Your job is to review the strategy and explain how the app will behave for this investor.',
    '',
    '## Strategy Profile',
    `- Markets: ${(s.markets || []).map(m => marketLabels[m] || m).join(', ')}`,
    `- Risk tolerance: ${riskLabels[s.risk] || s.risk}`,
    `- Investment horizon: ${horizonLabels[s.horizon] || s.horizon}`,
    `- Stock types of interest: ${(s.stockTypes || []).join(', ')}`,
    `- Sectors: ${s.sectors?.length ? s.sectors.join(', ') : 'All sectors'}`,
    `- Market cap preference: ${capLabels[s.marketCap] || s.marketCap}`,
    '',
    '## Scoring Engine (exact rules used by the app)',
    ...scoringLines,
    '',
    'Write a structured review with exactly four sections using these headings:',
    '',
    '## Strategy Assessment',
    'Is this a coherent strategy? Note any tensions between the choices and natural strengths. Two or three sentences.',
    '',
    '## How Stocks Will Be Scored',
    'Explain in plain English — for THIS investor — how the scoring engine will behave. Which signals are most likely to fire given the risk/horizon/type choices? Which will carry the most weight day-to-day? What kind of stocks will naturally score high vs low under this configuration? Be concrete, not generic.',
    '',
    '## Key Indicators to Watch',
    'The 5–6 most important indicators to monitor for this specific profile. For each, one sentence on why it matters HERE.',
    '',
    '## Watch Out For',
    'Two or three specific risks or pitfalls given these choices.',
    '',
    'Be direct and specific. No disclaimers. Flowing prose for Strategy Assessment and How Stocks Will Be Scored. Bullet points (starting with -) for the other two sections.',
  ].join('\n');
}

function buildAnalysisPrompt(ticker, data, rec, strategy) {
  const ind = rec.indicators || {};
  const lines = [
    `You are a concise financial analyst. Analyse ${ticker} (${data?.name || ticker}) for an investor with the following profile:`,
    `- Risk: ${strategy.risk} | Horizon: ${strategy.horizon} | Stock types: ${(strategy.stockTypes || []).join(', ')}`,
    ``,
    `Current data:`,
    `- Price: ${data?.currentPrice ? '£/$ ' + data.currentPrice.toFixed(2) : 'N/A'}`,
    `- P/E: ${data?.peRatio?.toFixed(1) ?? 'N/A'} | Fwd P/E: ${data?.forwardPE?.toFixed(1) ?? 'N/A'}`,
    `- Dividend yield: ${data?.dividendYield ? (data.dividendYield * 100).toFixed(1) + '%' : 'N/A'}`,
    `- Beta: ${data?.beta?.toFixed(2) ?? 'N/A'} | Market cap: ${data?.marketCap ? formatMktCap(data.marketCap) : 'N/A'}`,
    `- Revenue growth: ${data?.revenueGrowth ? (data.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}`,
    `- Earnings growth: ${data?.earningsGrowth ? (data.earningsGrowth * 100).toFixed(1) + '%' : 'N/A'}`,
    ``,
    `Technical signals (composite score ${rec.score}/100 — ${rec.signal}):`,
    `- RSI: ${ind.rsi?.toFixed(1) ?? 'N/A'}`,
    `- MACD histogram: ${ind.macd?.histogram?.toFixed(3) ?? 'N/A'}`,
    `- Golden cross (50MA > 200MA): ${ind.goldenCross ?? 'N/A'}`,
    `- Price vs 50MA: ${ind.priceVsMa50 ? (ind.priceVsMa50 * 100).toFixed(1) + '%' : 'N/A'}`,
    ``,
    `Key signals: ${(rec.signals || []).map(s => s.name + ' (' + s.direction + ')').join(', ')}`,
    ``,
    `Write a concise analysis in 3 short paragraphs:`,
    `1. What is bullish about this stock right now`,
    `2. Key risks or concerns`,
    `3. One-sentence verdict on fit with this investor's profile`,
    `Be direct and specific. No disclaimers. No bullet points — flowing prose only.`,
  ];
  return lines.join('\n');
}

function formatMktCap(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  return String(v);
}

// ── Navigation ────────────────────────────────────────────────

ipcMain.handle('preview-universe', (_e, strategy) => filterForStrategy(strategy));

ipcMain.handle('get-strategy-prompt', (_e, strategy) => {
  const stocks = filterForStrategy(strategy);
  return buildClaudePrompt(strategy, stocks);
});

ipcMain.handle('copy-and-open-claude', (_e, text) => {
  clipboard.writeText(text);
  const stamp    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = path.join(PROMPTS_DIR, `strategy-prompt-${stamp}.md`);
  fs.writeFileSync(filename, text);
  exec('open -a Claude');
});

ipcMain.handle('import-watchlist', (_e, text) => {
  const sharesDir = path.dirname(WATCHLIST_FILE);
  if (!fs.existsSync(sharesDir)) fs.mkdirSync(sharesDir, { recursive: true });
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  fs.writeFileSync(WATCHLIST_FILE, `# Claude Watchlist — ${date}\n\n${text}`);
  return { ok: true };
});

ipcMain.handle('open-dashboard', async () => {
  if (mainWindow) mainWindow.close();
  mainWindow = createWindow('src/dashboard/dashboard.html');
});

ipcMain.handle('open-interview', async () => {
  if (mainWindow) mainWindow.close();
  mainWindow = createWindow('src/interview/interview.html', { width: 720, height: 680 });
});
