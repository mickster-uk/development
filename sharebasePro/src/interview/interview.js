const TOTAL_STEPS = 6;
let currentStep = 1;
let reviewActive = false;
let pendingStrategy = null;

const answers = {
  markets:    [],
  risk:       null,
  horizon:    null,
  stockTypes: [],
  sectors:    [],
  marketCap:  null,
};

const MULTI_SELECT  = ['markets', 'stockTypes', 'sectors'];
const SINGLE_SELECT = ['risk', 'horizon', 'marketCap'];

function updateProgress() {
  const pct = reviewActive ? 100 : (currentStep / TOTAL_STEPS) * 100;
  document.getElementById('progress').style.width = `${pct}%`;
  document.getElementById('stepCounter').textContent = reviewActive ? 'Review' : `${currentStep} / ${TOTAL_STEPS}`;
  document.getElementById('btnBack').style.visibility = (currentStep === 1 && !reviewActive) ? 'hidden' : 'visible';
  if (!reviewActive) document.getElementById('btnNext').textContent = currentStep === TOTAL_STEPS ? 'Analyse Strategy' : 'Next';
}

function showStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');
  reviewActive = false;
  updateProgress();
}

function showReview() {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-review').classList.add('active');
  reviewActive = true;
  document.getElementById('btnBack').textContent  = 'Back to questions';
  document.getElementById('btnBack').style.visibility = 'visible';
  document.getElementById('btnNext').textContent  = 'Open Dashboard';
  document.getElementById('btnNext').disabled     = true;
  updateProgress();
}

function validateStep() {
  switch (currentStep) {
    case 1: return answers.markets.length > 0;
    case 2: return answers.risk !== null;
    case 3: return answers.horizon !== null;
    case 4: return answers.stockTypes.length > 0;
    case 5: return true;
    case 6: return answers.marketCap !== null;
    default: return false;
  }
}

async function next() {
  if (reviewActive) {
    if (pendingStrategy) {
      if (pastedClaudeResponse && parsedWatchlistTickers.length) {
        pendingStrategy.watchlist          = parsedWatchlistTickers;
        pendingStrategy.watchlistUpdatedAt = new Date().toISOString();
        await window.api.importWatchlist(pastedClaudeResponse);
      }
      window.api.saveStrategy(pendingStrategy);
    }
    return;
  }
  if (!validateStep()) {
    const btn = document.getElementById('btnNext');
    btn.style.background = '#c0392b';
    setTimeout(() => (btn.style.background = ''), 400);
    return;
  }
  if (currentStep === TOTAL_STEPS) return startReview();
  currentStep++;
  showStep(currentStep);
}

function back() {
  if (reviewActive) {
    reviewActive = false;
    document.getElementById('btnBack').textContent = 'Back';
    document.getElementById('btnNext').textContent = 'Analyse Strategy';
    document.getElementById('btnNext').disabled    = false;
    showStep(TOTAL_STEPS);
    return;
  }
  if (currentStep === 1) return;
  currentStep--;
  showStep(currentStep);
}

let generatedPrompt       = '';
let pastedClaudeResponse  = '';
let parsedWatchlistTickers = [];

function parseWatchlistTickers(text) {
  const match = text.match(/^##\s*Watchlist\s*\n([\s\S]*?)(?:\n##\s|\s*$)/im);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.replace(/^[-*\s]+/, '').trim().toUpperCase())
    .filter(l => /^[A-Z]{1,5}(\.L)?$/.test(l));
}

async function startReview() {
  pendingStrategy = { ...answers, createdAt: new Date().toISOString() };
  showReview();

  const [prompt, stocks] = await Promise.all([
    window.api.getStrategyPrompt(pendingStrategy),
    window.api.previewUniverse(pendingStrategy),
  ]);

  generatedPrompt = prompt;
  document.getElementById('promptBox').textContent = prompt;
  document.getElementById('btnNext').disabled = false;

  renderUniverseList(stocks);

  document.getElementById('btnClaude').addEventListener('click', async () => {
    await window.api.copyAndOpenClaude(generatedPrompt);
    const btn = document.getElementById('btnClaude');
    btn.textContent = 'Copied! Claude is opening…';
    btn.classList.add('copied');
    document.getElementById('copyHint').textContent = 'Paste Claude\'s response below once it\'s done';
    document.getElementById('pasteSection').style.display = '';
  });

  document.getElementById('pasteArea').addEventListener('input', () => {
    pastedClaudeResponse = document.getElementById('pasteArea').value;
    parsedWatchlistTickers = parseWatchlistTickers(pastedClaudeResponse);
    const countEl   = document.getElementById('pasteCount');
    const tickersEl = document.getElementById('pasteTickers');
    if (!pastedClaudeResponse.trim()) {
      countEl.style.display = 'none';
      tickersEl.innerHTML = '';
      return;
    }
    countEl.style.display = '';
    if (parsedWatchlistTickers.length) {
      countEl.textContent = `${parsedWatchlistTickers.length} stocks found in watchlist`;
      countEl.className = 'paste-count';
      tickersEl.innerHTML = parsedWatchlistTickers
        .map(t => `<span class="paste-ticker-chip">${t.replace(/\.L$/, '')}</span>`)
        .join('');
    } else {
      countEl.textContent = 'No ## Watchlist section found — make sure Claude included it';
      countEl.className = 'paste-count error';
      tickersEl.innerHTML = '';
    }
  });

  document.getElementById('skipLink').addEventListener('click', () => {
    pastedClaudeResponse  = '';
    parsedWatchlistTickers = [];
    document.getElementById('pasteSection').style.display = 'none';
  });
}

function renderUniverseList(stocks) {
  if (!stocks?.length) return;
  const section = document.getElementById('universeSection');
  const header  = document.getElementById('universeHeader');
  const grid    = document.getElementById('universeGrid');

  header.textContent = `Stock universe — ${stocks.length} stocks matched`;
  grid.innerHTML = stocks.map(s => `
    <div class="universe-chip">
      <span class="uc-ticker">${s.ticker.replace(/\.L$/, '')}</span>
      <span class="uc-name">${s.name}</span>
    </div>`).join('');
  section.style.display = '';
}

// ── Option click handling ─────────────────────────────────────

function bindOptions(groupId, key, multi) {
  const container = document.getElementById(groupId);
  if (!container) return;
  container.querySelectorAll('.option').forEach(opt => {
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      if (multi) {
        if (answers[key].includes(val)) {
          answers[key] = answers[key].filter(v => v !== val);
          opt.classList.remove('selected');
        } else {
          answers[key].push(val);
          opt.classList.add('selected');
        }
      } else {
        container.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        answers[key] = val;
        opt.classList.add('selected');
      }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────

MULTI_SELECT.forEach(id  => bindOptions(id, id, true));
SINGLE_SELECT.forEach(id => bindOptions(id, id, false));
document.getElementById('btnBack').addEventListener('click', () => back());
document.getElementById('btnNext').addEventListener('click', () => next());
showStep(1);
