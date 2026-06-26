let recommendations = [];
let universe = [];
let selectedTicker = null;
let activeFilter = 'all';
let priceChart = null;
let rsiChart = null;
let macdChart = null;
let aiStreaming = false;

// Debug state
let debugEntries = [];
let debugPanelOpen = false;
let debugAiStreaming = false;

// ── Boot ──────────────────────────────────────────────────────

async function init() {
  window.api.onFetchStatus(msg => {
    setStatus(msg);
    showLoading(true, msg);
  });
  window.api.onFetchComplete(async () => {
    showLoading(false);
    hidePausedBanner();
    await refresh();
  });
  window.api.onFetchPaused(({ failureCount }) => {
    showLoading(false);
    showPausedBanner(failureCount);
  });
  window.api.onAiChunk(text => appendAiChunk(text));
  window.api.onAiDone(() => finishAiStream());
  window.api.onDebugEvent(entry => addDebugEntry(entry));
  window.api.onDebugAiChunk(text => appendDebugAiChunk(text));
  window.api.onDebugAiDone(() => finishDebugAiStream());

  // Static button wiring
  document.getElementById('btnFetch').addEventListener('click', () => fetchNow());
  document.getElementById('btnFetchEmpty').addEventListener('click', () => fetchNow());
  document.getElementById('btnModalCancel').addEventListener('click', () => closeSettings());
  document.getElementById('btnModalSave').addEventListener('click', () => saveApiKey());

  // Config dropdown
  const configBtn      = document.getElementById('btnConfig');
  const configDropdown = document.getElementById('configDropdown');
  configBtn.addEventListener('click', e => { e.stopPropagation(); configDropdown.classList.toggle('open'); });
  document.addEventListener('click', () => configDropdown.classList.remove('open'));

  document.getElementById('ddStrategy').addEventListener('click', () => { configDropdown.classList.remove('open'); window.api.openInterview(); });
  document.getElementById('ddApiKey').addEventListener('click', () => { configDropdown.classList.remove('open'); openSettings(); });
  document.getElementById('ddResetDismissed').addEventListener('click', async () => {
    configDropdown.classList.remove('open');
    await window.api.resetDismissed();
    await refresh();
  });

  // Filter chips
  document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
  document.getElementById('filterStarred').addEventListener('click', () => setFilter('starred'));
  document.getElementById('filterBuy').addEventListener('click', () => setFilter('buy'));

  // Stock badge grid delegation
  document.getElementById('stockList').addEventListener('click', e => {
    const badge = e.target.closest('.stock-badge');
    if (badge) renderDetail(badge.dataset.ticker);
  });

  // Paused banner
  document.getElementById('btnRetryFetch').addEventListener('click', () => retryFetch());
  document.getElementById('btnDismissPause').addEventListener('click', () => hidePausedBanner());

  // Debug panel buttons
  document.getElementById('btnOpenDebug').addEventListener('click',    () => openDebugPanel());
  document.getElementById('btnCloseDebug').addEventListener('click',   () => closeDebugPanel());
  document.getElementById('btnClearDebug').addEventListener('click',   () => clearDebugLog());
  document.getElementById('btnAnalyseDebug').addEventListener('click', () => analyseDebugWithOllama());

  // Debug entry expand/collapse delegation
  document.getElementById('debugEntries').addEventListener('click', e => {
    const header = e.target.closest('.debug-entry-header');
    if (!header) return;
    const entry = header.closest('.debug-entry');
    if (entry) entry.classList.toggle('expanded');
    // Tab switching
    const tab = e.target.closest('.debug-tab');
    if (tab) {
      const pane = tab.closest('.debug-body');
      pane.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
      pane.querySelectorAll('.debug-tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      pane.querySelector(`.debug-tab-pane[data-tab="${tab.dataset.tab}"]`).classList.add('active');
    }
  });

  // Tab switching in debug entries (delegated separately for tab clicks)
  document.getElementById('debugEntries').addEventListener('click', e => {
    const tab = e.target.closest('.debug-tab');
    if (!tab) return;
    e.stopPropagation();
    const body = tab.closest('.debug-body');
    body.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
    body.querySelectorAll('.debug-tab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    body.querySelector(`.debug-tab-pane[data-tab="${tab.dataset.tab}"]`).classList.add('active');
  });

  // Load saved config into modal
  const savedCfg = await window.api.loadConfig();
  document.getElementById('failureThresholdInput').value = savedCfg.apiFailureThreshold ?? 3;
  document.getElementById('ollamaUrlInput').value        = savedCfg.ollamaUrl            || '';
  document.getElementById('ollamaModelInput').value      = savedCfg.ollamaModel           || '';
  document.getElementById('debugModeToggle').checked     = !!savedCfg.debugMode;
  applyDebugMode(!!savedCfg.debugMode);

  await renderStrategySummary();
  await refresh();
}

// ── Strategy summary ──────────────────────────────────────────

const RISK_LABELS = { conservative: '🛡 Conservative', moderate: '⚖️ Moderate', aggressive: '🚀 Aggressive' };
const HORIZON_LABELS = { short: '⚡ Short-term', medium: '📅 Medium-term', long: '🏔 Long-term' };
const MARKET_FLAGS   = { US: '🇺🇸 US', UK: '🇬🇧 UK', ETF: '📦 ETFs' };

async function renderStrategySummary() {
  const el = document.getElementById('strategySummary');
  const [strategy, universe] = await Promise.all([
    window.api.loadStrategy(),
    window.api.getUniverse(),
  ]);
  if (!strategy) { el.style.display = 'none'; return; }

  const riskClass = `risk-${strategy.risk || 'moderate'}`;
  const pills = [
    `<span class="ss-pill ${riskClass}">${RISK_LABELS[strategy.risk] || strategy.risk}</span>`,
    `<span class="ss-pill">${HORIZON_LABELS[strategy.horizon] || strategy.horizon}</span>`,
    ...(strategy.markets || []).map(m => `<span class="ss-pill">${MARKET_FLAGS[m] || m}</span>`),
    ...(strategy.sectors || []).slice(0, 3).map(s => `<span class="ss-pill">${s}</span>`),
  ].join('');

  const names  = universe.map(s => s.name || s.ticker);
  const preview = names.slice(0, 4).join(', ');
  const more   = names.length > 4 ? ` <strong>+${names.length - 4} more</strong>` : '';

  el.innerHTML = `
    <div class="ss-pills">${pills}</div>
    <div class="ss-stocks">${preview}${more}</div>
    <button class="ss-change-btn" id="btnChangeStrategy">Change strategy</button>`;
  document.getElementById('btnChangeStrategy').addEventListener('click', () => window.api.openInterview());
  el.style.display = '';
}

// ── State helpers ─────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('statusChip').textContent = msg;
}

function showLoading(visible, msg = '') {
  const loading = document.getElementById('loadingState');
  const empty   = document.getElementById('emptyState');
  const detail  = document.getElementById('detailPanel');
  if (visible) {
    loading.style.display = '';
    empty.style.display   = 'none';
    detail.style.display  = 'none';
    if (msg) document.getElementById('loadingMsg').textContent = msg;
  } else {
    loading.style.display = 'none';
  }
}

function setFilter(f) {
  activeFilter = f;
  ['All','Starred','Buy'].forEach(n => {
    const el = document.getElementById('filter' + n);
    el.classList.toggle('active', f === n.toLowerCase());
  });
  renderStockList();
}

// ── Data ──────────────────────────────────────────────────────

async function refresh() {
  [recommendations, universe] = await Promise.all([
    window.api.getRecommendations(),
    window.api.getUniverse(),
  ]);
  renderStockList();
  if (!recommendations.length) {
    document.getElementById('emptyState').style.display = '';
    document.getElementById('detailPanel').style.display = 'none';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';
  const target = selectedTicker && recommendations.find(r => r.ticker === selectedTicker)
    ? selectedTicker
    : recommendations[0].ticker;
  renderDetail(target);
}

async function fetchNow() {
  const btn = document.getElementById('btnFetch');
  btn.disabled = true;
  showLoading(true, 'Fetching stocks for your profile…');
  await window.api.fetchNow();
  btn.disabled = false;
}

// ── Stock list sidebar ────────────────────────────────────────

function renderStockList() {
  const container = document.getElementById('stockList');
  const recMap    = Object.fromEntries(recommendations.map(r => [r.ticker, r]));

  let list = universe;
  if (activeFilter === 'starred') list = list.filter(u => recMap[u.ticker]?.starred);
  if (activeFilter === 'buy')     list = list.filter(u => recMap[u.ticker]?.signal === 'BUY');

  document.getElementById('stockCount').textContent = `${list.length} / ${universe.length}`;

  container.innerHTML = list.map(u => {
    const rec      = recMap[u.ticker];
    const signal   = rec?.signal || '';
    const hasSignal = signal && signal !== 'INSUFFICIENT_DATA';
    const score    = rec?.score;
    const sigCls   = signal === 'BUY' ? 'bull' : signal === 'SELL' ? 'bear' : 'neutral';
    const topCls   = signal === 'BUY' ? 'sig-buy' : signal === 'SELL' ? 'sig-sell' : signal === 'HOLD' ? 'sig-hold' : '';
    const label    = u.ticker.replace(/\.L$/, '');

    return `<div class="stock-badge${topCls ? ' ' + topCls : ''}${selectedTicker === u.ticker ? ' active' : ''}" data-ticker="${u.ticker}" title="${u.name || u.ticker}">
      ${rec?.starred ? '<span class="badge-star">⭐</span>' : ''}
      <span class="badge-ticker">${label}</span>
      ${hasSignal
        ? `<span class="badge-sig ${sigCls}">${signal}</span><span class="badge-score">${score}</span>`
        : `<span class="badge-sig neutral">—</span>`}
    </div>`;
  }).join('');
}

function scoreCol(score) {
  if (score >= 60) return '#2CA87F';
  if (score <= 35) return '#E4503C';
  return '#E4B43C';
}

async function toggleStar(ticker) {
  const rec = recommendations.find(r => r.ticker === ticker);
  if (!rec) return;
  if (rec.starred) await window.api.unstarTicker(ticker);
  else             await window.api.starTicker(ticker);
  rec.starred = !rec.starred;
  renderStockList();
}

// ── Detail panel ──────────────────────────────────────────────

async function renderDetail(ticker) {
  selectedTicker = ticker;
  renderStockList();

  const data = await window.api.getStockData(ticker);
  const rec  = recommendations.find(r => r.ticker === ticker);
  if (!data || !rec) return;

  const detail = document.getElementById('detailPanel');
  detail.style.display = '';
  document.getElementById('emptyState').style.display = 'none';

  const scoreColor = scoreCol(rec.score);
  const badgeClass = rec.signal === 'BUY' ? 'badge-buy' : rec.signal === 'SELL' ? 'badge-sell' : 'badge-hold';

  detail.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-ticker">${ticker} <span class="signal-badge ${badgeClass}" style="font-size:14px">${rec.signal}</span></div>
        <div class="detail-name">${data.name || ''} &middot; ${data.exchange || ''} &middot; ${data.currency || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="detail-score" style="color:${scoreColor}">${rec.score}<span style="font-size:13px;font-weight:400;color:var(--text2)">/100</span></div>
        <div style="font-size:11px;color:var(--text2)">Composite score</div>
      </div>
    </div>
    <div class="score-bar-bg"><div class="score-bar-fill" style="width:${rec.score}%;background:${scoreColor}"></div></div>

    <div class="panel">
      <div class="panel-title">Price Chart</div>
      <div class="charts-grid">
        <div>
          <div class="chart-label">Price · 50MA · 200MA (90 days)</div>
          <canvas id="priceChart" height="150"></canvas>
        </div>
        <div>
          <div class="chart-label">RSI (14)</div>
          <canvas id="rsiChart" height="70"></canvas>
          <div class="chart-label" style="margin-top:10px">MACD Histogram</div>
          <canvas id="macdChart" height="65"></canvas>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Signals</div>
      <div class="signals-grid">
        ${(rec.signals || []).map(s => `
          <div class="signal-row">
            <span class="signal-name ${s.direction}">${s.name}</span>
            <span class="signal-val ${s.direction}">${s.value || s.detail || ''}</span>
          </div>`).join('')}
      </div>
      <p class="reasoning" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">${rec.reasoning || ''}</p>
    </div>

    <div class="panel">
      <div class="panel-title">Fundamentals</div>
      <div class="fundamentals">
        ${fund('P/E',         data.peRatio?.toFixed(1))}
        ${fund('Fwd P/E',    data.forwardPE?.toFixed(1))}
        ${fund('EPS',        data.eps?.toFixed(2))}
        ${fund('Div Yield',  data.dividendYield ? (data.dividendYield*100).toFixed(1)+'%' : null)}
        ${fund('Beta',       data.beta?.toFixed(2))}
        ${fund('Mkt Cap',    fmtCap(data.marketCap))}
        ${fund('Rev Growth', data.revenueGrowth  ? (data.revenueGrowth*100).toFixed(1)+'%'  : null)}
        ${fund('ROE',        data.returnOnEquity ? (data.returnOnEquity*100).toFixed(1)+'%' : null)}
      </div>
    </div>

    <div class="ai-panel" id="aiPanel">
      <div class="ai-header">
        <span class="ai-title">AI Analysis</span>
        <span class="ai-model" id="aiModelBadge">ollama</span>
      </div>
      <div class="ai-body" id="aiBody">Click analyse to get a local AI take on this stock given your strategy.</div>
      <div class="ai-actions">
        <button class="btn btn-primary" id="btnAnalyse">✦ Analyse</button>
      </div>
    </div>`;

  drawCharts(data.history || [], rec.indicators);

  // Show configured model in badge and wire analyse button
  const ollamaCfg = await window.api.loadConfig();
  document.getElementById('aiModelBadge').textContent = ollamaCfg.ollamaModel;
  document.getElementById('btnAnalyse').addEventListener('click', () => runAnalysis(ticker, data, rec));
}

function fund(label, val) {
  return `<div class="fund-item"><div class="fund-label">${label}</div><div class="fund-val">${val ?? '—'}</div></div>`;
}

function fmtCap(v) {
  if (!v) return '—';
  if (v >= 1e12) return (v/1e12).toFixed(1)+'T';
  if (v >= 1e9)  return (v/1e9).toFixed(1)+'B';
  if (v >= 1e6)  return (v/1e6).toFixed(1)+'M';
  return String(v);
}

// ── AI Analysis ───────────────────────────────────────────────

async function runAnalysis(ticker, stockData, rec) {
  if (aiStreaming) return;
  aiStreaming = true;

  const btn = document.getElementById('btnAnalyse');
  const body = document.getElementById('aiBody');
  if (!btn || !body) return;

  btn.disabled = true;
  btn.textContent = 'Analysing…';
  body.className = 'ai-body streaming';
  body.innerHTML = '<span class="cursor-blink"></span>';

  const strategy = await window.api.loadStrategy() || {};
  await window.api.getAiAnalysis({ ticker, stockData, rec, strategy });
}

function appendAiChunk(text) {
  const body = document.getElementById('aiBody');
  if (!body) return;
  const cursor = body.querySelector('.cursor-blink');
  if (cursor) cursor.remove();
  body.appendChild(document.createTextNode(text));
  body.innerHTML += '<span class="cursor-blink"></span>';
}

function finishAiStream() {
  aiStreaming = false;
  const body = document.getElementById('aiBody');
  const btn  = document.getElementById('btnAnalyse');
  if (body) {
    const cursor = body.querySelector('.cursor-blink');
    if (cursor) cursor.remove();
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = '↺ Re-analyse';
  }
}

// ── Fetch pause / retry ───────────────────────────────────────

function showPausedBanner(failureCount) {
  const bar = document.getElementById('fetchPausedBar');
  document.getElementById('pauseReason').textContent =
    `${failureCount} API ${failureCount === 1 ? 'failure' : 'failures'} — threshold reached`;
  bar.classList.add('visible');
}

function hidePausedBanner() {
  document.getElementById('fetchPausedBar').classList.remove('visible');
}

async function retryFetch() {
  hidePausedBanner();
  const btn = document.getElementById('btnFetch');
  btn.disabled = true;
  showLoading(true, 'Retrying fetch…');
  await window.api.retryFetch();
  btn.disabled = false;
}

// ── Settings modal ────────────────────────────────────────────

function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function saveApiKey() {
  const debugMode = document.getElementById('debugModeToggle').checked;
  const threshold = parseInt(document.getElementById('failureThresholdInput').value, 10);
  await window.api.saveConfig({
    apiFailureThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 3,
    ollamaUrl:           document.getElementById('ollamaUrlInput').value.trim(),
    ollamaModel:         document.getElementById('ollamaModelInput').value.trim(),
    debugMode,
  });
  applyDebugMode(debugMode);
  closeSettings();
}

// ── Charts ────────────────────────────────────────────────────

const CHART_OPTS = {
  responsive: true,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#6b7280', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: '#242840' } },
    y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#242840' } }
  }
};

function drawCharts(history, ind) {
  if (!history.length) return;
  const recent = history.slice(-90);
  const labels = recent.map(d => d.date.slice(5));

  [priceChart, rsiChart, macdChart].forEach(c => { if (c) c.destroy(); });

  const closes   = recent.map(d => d.close);
  const ma50Data = computeSma(history, 50).slice(-90);
  const ma200Data = computeSma(history, 200).slice(-90);

  priceChart = new Chart(document.getElementById('priceChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { data: closes,   borderColor: '#5B6FE4', borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        { data: ma50Data,  borderColor: '#E4B43C', borderWidth: 1,   pointRadius: 0 },
        { data: ma200Data, borderColor: '#E4503C', borderWidth: 1,   pointRadius: 0, borderDash: [4,3] },
      ]
    },
    options: { ...CHART_OPTS }
  });

  if (ind?.rsi !== null) {
    const rsiSeries = computeRsi(history, 14).slice(-90);
    rsiChart = new Chart(document.getElementById('rsiChart'), {
      type: 'line',
      data: { labels, datasets: [{ data: rsiSeries, borderColor: '#9B59B6', borderWidth: 1.5, pointRadius: 0 }] },
      options: { ...CHART_OPTS, scales: { ...CHART_OPTS.scales, y: { ...CHART_OPTS.scales.y, min: 0, max: 100 } } }
    });
  }

  if (ind?.macd) {
    const macdSeries = computeMacdHist(history).slice(-90);
    macdChart = new Chart(document.getElementById('macdChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: macdSeries, backgroundColor: macdSeries.map(v => v >= 0 ? 'rgba(44,168,127,0.6)' : 'rgba(228,80,60,0.6)'), borderWidth: 0 }]
      },
      options: { ...CHART_OPTS }
    });
  }
}

function computeSma(history, period) {
  const closes = history.map(d => d.close);
  const result = new Array(history.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    result[i] = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  }
  return result;
}

function computeRsi(history, period = 14) {
  const closes = history.map(d => d.close);
  const result = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  result[period] = 100 - 100 / (1 + avgG / (avgL || 1e-9));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    avgG = (avgG * (period-1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period-1) + Math.max(-d, 0)) / period;
    result[i] = 100 - 100 / (1 + avgG / (avgL || 1e-9));
  }
  return result;
}

function computeMacdHist(history, fast = 12, slow = 26, sig = 9) {
  const closes = history.map(d => d.close);
  const result = new Array(closes.length).fill(null);
  const ema = (arr, p) => { const k = 2/(p+1); let e = arr[0]; return arr.map(v => (e = v*k + e*(1-k))); };
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const signalLine = ema(macdLine.slice(slow-1), sig);
  for (let i = slow-1+sig-1; i < closes.length; i++) {
    result[i] = macdLine[i] - signalLine[i-(slow-1)];
  }
  return result;
}

// ── Debug panel ───────────────────────────────────────────────

function applyDebugMode(enabled) {
  document.getElementById('debugBtnWrap').style.display = enabled ? '' : 'none';
  if (!enabled && debugPanelOpen) closeDebugPanel();
}

function openDebugPanel() {
  debugPanelOpen = true;
  document.getElementById('debugPanel').classList.add('open');
  updateDebugBadge(0);
}

function closeDebugPanel() {
  debugPanelOpen = false;
  document.getElementById('debugPanel').classList.remove('open');
}

function clearDebugLog() {
  debugEntries = [];
  renderDebugEntries();
  document.getElementById('debugAnalysis').style.display = 'none';
  updateDebugBadge(0);
}

function updateDebugBadge(count) {
  const badge = document.getElementById('debugBadge');
  if (count > 0 && !debugPanelOpen) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

function addDebugEntry(entry) {
  debugEntries.push(entry);
  const container = document.getElementById('debugEntries');

  // Clear the "no events yet" placeholder on first entry
  if (debugEntries.length === 1) container.innerHTML = '';

  container.appendChild(buildEntryEl(entry));
  container.scrollTop = container.scrollHeight;

  const countBadge = document.getElementById('debugCountBadge');
  countBadge.textContent = `${debugEntries.length} event${debugEntries.length === 1 ? '' : 's'}`;

  if (!debugPanelOpen) updateDebugBadge(debugEntries.length);
}

function renderDebugEntries() {
  const container = document.getElementById('debugEntries');
  if (!debugEntries.length) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text2);font-size:12px">No events yet — trigger a fetch or AI analysis to see requests here.</div>';
    document.getElementById('debugCountBadge').textContent = '0 events';
    return;
  }
  container.innerHTML = '';
  debugEntries.forEach(e => container.appendChild(buildEntryEl(e)));
}

function buildEntryEl(entry) {
  const hasError = !!entry.error;
  const typeClass = hasError ? 'error' : entry.type;
  const dur = entry.durationMs != null ? `${entry.durationMs}ms` : '';
  const ts  = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-GB') : '';

  const reqHtml  = syntaxHighlight(entry.request  ?? null);
  const respHtml = syntaxHighlight(entry.response ?? null);

  const el = document.createElement('div');
  el.className = `debug-entry${hasError ? ' has-error' : ''}`;
  el.innerHTML = `
    <div class="debug-entry-header">
      <span class="debug-type ${typeClass}">${entry.type}</span>
      <span class="debug-label" title="${entry.label}">${entry.label}</span>
      ${hasError ? '<span class="debug-error-dot" title="Error"></span>' : ''}
      <span class="debug-duration">${dur}</span>
      <span style="font-size:10px;color:var(--text2);margin-left:4px">${ts}</span>
      <span class="debug-chevron">▶</span>
    </div>
    <div class="debug-body">
      ${hasError ? `<div style="padding:8px 10px"><div class="debug-error-msg">⚠ ${escHtml(entry.error)}</div></div>` : ''}
      <div class="debug-tabs">
        <div class="debug-tab active" data-tab="request">Request</div>
        <div class="debug-tab" data-tab="response">Response</div>
      </div>
      <div class="debug-tab-pane active" data-tab="request">
        <pre class="debug-json-pre">${reqHtml}</pre>
      </div>
      <div class="debug-tab-pane" data-tab="response">
        <pre class="debug-json-pre">${respHtml}</pre>
      </div>
    </div>`;
  return el;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function syntaxHighlight(obj) {
  if (obj === null || obj === undefined) return '<span class="j-null">null</span>';
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  const safe = str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe.replace(
    /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      let cls = 'j-num';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'j-key' : 'j-str';
      else if (/true|false/.test(match)) cls = 'j-bool';
      else if (match === 'null') cls = 'j-null';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

async function analyseDebugWithOllama() {
  if (debugAiStreaming || !debugEntries.length) return;
  debugAiStreaming = true;

  const analysisEl = document.getElementById('debugAnalysis');
  const bodyEl     = document.getElementById('debugAnalysisBody');
  const statusEl   = document.getElementById('debugAnalysisStatus');

  analysisEl.style.display = '';
  bodyEl.className = 'debug-analysis-body streaming';
  bodyEl.innerHTML = '<span class="cursor-blink"></span>';
  statusEl.textContent = 'Streaming…';

  document.getElementById('btnAnalyseDebug').disabled = true;

  await window.api.analyseDebug({ entries: debugEntries });
}

function appendDebugAiChunk(text) {
  const body = document.getElementById('debugAnalysisBody');
  if (!body) return;
  const cursor = body.querySelector('.cursor-blink');
  if (cursor) cursor.remove();
  body.appendChild(document.createTextNode(text));
  body.insertAdjacentHTML('beforeend', '<span class="cursor-blink"></span>');
}

function finishDebugAiStream() {
  debugAiStreaming = false;
  const body     = document.getElementById('debugAnalysisBody');
  const statusEl = document.getElementById('debugAnalysisStatus');
  const btn      = document.getElementById('btnAnalyseDebug');
  if (body)     { const c = body.querySelector('.cursor-blink'); if (c) c.remove(); body.className = 'debug-analysis-body'; }
  if (statusEl) statusEl.textContent = 'Done';
  if (btn)      btn.disabled = false;
}

// ── Start ─────────────────────────────────────────────────────
init();
