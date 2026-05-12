// Global state
let config = {
  endpoint: 'http://localhost:11434',
  model1: '',
  model2: '',
  model3: '',
  requestConfig: {},
  responseConfig: {}
};

const REQ_PERSONALITIES = ['neutral', 'frustrated', 'confused', 'anxious', 'hostile', 'polite'];
const REQ_TONES         = ['neutral', 'formal', 'casual', 'aggressive', 'desperate', 'polite'];
const RES_PERSONALITIES = ['professional', 'empathetic', 'friendly', 'robotic', 'formal'];
const RES_TONES         = ['helpful', 'formal', 'casual', 'empathetic', 'authoritative', 'cautious'];
const RES_STYLES        = ['concise', 'detailed', 'structured', 'simple'];
const REQ_CHECKBOX_IDS  = [
  'req-badLanguage', 'req-aggressiveLanguage', 'req-slowReader',
  'req-englishNotFirst', 'req-depression', 'req-suicidalSelfHarm',
  'req-personalInjury', 'req-hurtingOthers', 'req-medicalIssues',
  'req-pciData', 'req-financialAdvice'
];

let testHistory = [];

// DOM Elements
const queryInput = document.getElementById('queryInput');
const runTestBtn = document.getElementById('runTestBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');

const bot1Query = document.getElementById('bot1Query');
const bot2Response = document.getElementById('bot2Response');
const bot2Box = document.getElementById('bot2Box');
const evaluationBadge = document.getElementById('evaluationBadge');
const evaluationText = document.getElementById('evaluationText');
const evaluationSection = document.getElementById('evaluationSection');
const evaluationConfidence = document.getElementById('evaluationConfidence');
const evaluationReasoning = document.getElementById('evaluationReasoning');

const settingsBtn = document.getElementById('settingsBtn');
const historyBtn = document.getElementById('historyBtn');
const settingsPanel = document.getElementById('settingsPanel');
const historyPanel = document.getElementById('historyPanel');
const endpointInput = document.getElementById('endpointInput');
const model1Select = document.getElementById('model1Select');
const model2Select = document.getElementById('model2Select');
const model3Select = document.getElementById('model3Select');
const loadModelsBtn = document.getElementById('loadModelsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyContent = document.getElementById('historyContent');

// Initialize app
async function initializeApp() {
  try {
    config = await window.botTesterAPI.getConfig();
    endpointInput.value = config.endpoint;
    model1Select.value = config.model1 || '';
    model2Select.value = config.model2 || '';
    model3Select.value = config.model3 || '';

    populateRequestConfig(config.requestConfig || {});
    populateResponseConfig(config.responseConfig || {});

    testHistory = await window.botTesterAPI.getHistory();
    updateHistoryDisplay();
    await loadAvailableModels();
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to initialize app: ' + error.message);
  }
}

function populateRequestConfig(cfg) {
  document.getElementById('req-personality').value          = cfg.personality    || 'neutral';
  document.getElementById('req-tone').value                 = cfg.tone           || 'neutral';
  document.getElementById('req-badLanguage').checked        = !!cfg.badLanguage;
  document.getElementById('req-aggressiveLanguage').checked = !!cfg.aggressiveLanguage;
  document.getElementById('req-slowReader').checked         = !!cfg.slowReader;
  document.getElementById('req-englishNotFirst').checked    = !!cfg.englishNotFirst;
  document.getElementById('req-depression').checked         = !!cfg.depression;
  document.getElementById('req-suicidalSelfHarm').checked   = !!cfg.suicidalSelfHarm;
  document.getElementById('req-personalInjury').checked     = !!cfg.personalInjury;
  document.getElementById('req-hurtingOthers').checked      = !!cfg.hurtingOthers;
  document.getElementById('req-medicalIssues').checked      = !!cfg.medicalIssues;
  document.getElementById('req-pciData').checked            = !!cfg.pciData;
  document.getElementById('req-financialAdvice').checked    = !!cfg.financialAdvice;
  document.getElementById('req-randomize').checked          = !!cfg.randomize;
  syncChips();
}

function populateResponseConfig(cfg) {
  document.getElementById('res-personality').value = cfg.personality || 'professional';
  document.getElementById('res-tone').value        = cfg.tone        || 'helpful';
  document.getElementById('res-style').value       = cfg.style       || 'concise';
  document.getElementById('res-randomize').checked = !!cfg.randomize;
}

function getRequestConfig() {
  return {
    personality:        document.getElementById('req-personality').value,
    tone:               document.getElementById('req-tone').value,
    badLanguage:        document.getElementById('req-badLanguage').checked,
    aggressiveLanguage: document.getElementById('req-aggressiveLanguage').checked,
    slowReader:         document.getElementById('req-slowReader').checked,
    englishNotFirst:    document.getElementById('req-englishNotFirst').checked,
    depression:         document.getElementById('req-depression').checked,
    suicidalSelfHarm:   document.getElementById('req-suicidalSelfHarm').checked,
    personalInjury:     document.getElementById('req-personalInjury').checked,
    hurtingOthers:      document.getElementById('req-hurtingOthers').checked,
    medicalIssues:      document.getElementById('req-medicalIssues').checked,
    pciData:            document.getElementById('req-pciData').checked,
    financialAdvice:    document.getElementById('req-financialAdvice').checked,
    randomize:          document.getElementById('req-randomize').checked
  };
}

function getResponseConfig() {
  return {
    personality: document.getElementById('res-personality').value,
    tone:        document.getElementById('res-tone').value,
    style:       document.getElementById('res-style').value,
    randomize:   document.getElementById('res-randomize').checked
  };
}

function applyRandomRequestConfig() {
  document.getElementById('req-personality').value = REQ_PERSONALITIES[Math.floor(Math.random() * REQ_PERSONALITIES.length)];
  document.getElementById('req-tone').value        = REQ_TONES[Math.floor(Math.random() * REQ_TONES.length)];
  REQ_CHECKBOX_IDS.forEach(id => { document.getElementById(id).checked = false; });
  const count = Math.floor(Math.random() * 3);
  const shuffled = [...REQ_CHECKBOX_IDS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) document.getElementById(shuffled[i]).checked = true;
  syncChips();
}

function applyRandomResponseConfig() {
  document.getElementById('res-personality').value = RES_PERSONALITIES[Math.floor(Math.random() * RES_PERSONALITIES.length)];
  document.getElementById('res-tone').value        = RES_TONES[Math.floor(Math.random() * RES_TONES.length)];
  document.getElementById('res-style').value       = RES_STYLES[Math.floor(Math.random() * RES_STYLES.length)];
}

function toggleConfigSection(id) {
  document.getElementById(id).classList.toggle('collapsed');
}

function toggleChip(chip) {
  const checkbox = document.getElementById(chip.dataset.check);
  if (!checkbox) return;
  checkbox.checked = !checkbox.checked;
  chip.classList.toggle('selected', checkbox.checked);
  updateVulnCount();
}

function syncChips() {
  document.querySelectorAll('.chip[data-check]').forEach(chip => {
    const checkbox = document.getElementById(chip.dataset.check);
    if (checkbox) chip.classList.toggle('selected', checkbox.checked);
  });
  updateVulnCount();
}

function updateVulnCount() {
  const count = document.querySelectorAll('.chip[data-check].selected').length;
  const badge = document.getElementById('vulnCount');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function toggleBotConfig(botNum, event) {
  event.stopPropagation();
  const panel  = document.getElementById(`bot${botNum}ConfigPanel`);
  const btn    = document.getElementById(`bot${botNum}ConfigBtn`);
  const other  = botNum === 1 ? 2 : 1;
  document.getElementById(`bot${other}ConfigPanel`).classList.add('hidden');
  document.getElementById(`bot${other}ConfigBtn`).classList.remove('active');

  const opening = panel.classList.contains('hidden');
  if (opening) {
    const rect = btn.getBoundingClientRect();
    panel.style.top   = (rect.bottom + 6) + 'px';
    // align right edge of panel with right edge of button
    panel.style.left  = 'auto';
    panel.style.right = (window.innerWidth - rect.right) + 'px';
    panel.classList.remove('hidden');
    btn.classList.add('active');
  } else {
    panel.classList.add('hidden');
    btn.classList.remove('active');
  }
}

// Settings Panel
function toggleSettings() {
  settingsPanel.classList.toggle('hidden');
}

function toggleHistory() {
  historyPanel.classList.toggle('hidden');
}

async function loadAvailableModels() {
  try {
    const endpoint = endpointInput.value || config.endpoint;
    showError(''); // Clear any previous errors

    const models = await window.botTesterAPI.getModels(endpoint);

    if (!models || models.length === 0) {
      showError('No models found. Make sure your LLM service is running.');
      return;
    }

    const savedValues = [config.model1, config.model2, config.model3];
    [model1Select, model2Select, model3Select].forEach((select, i) => {
      select.innerHTML = '<option value="">Select a model...</option>';
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
      });
      if (savedValues[i]) select.value = savedValues[i];
    });

    showError(''); // Clear loading message
  } catch (error) {
    console.error('Error loading models:', error);
    showError('Failed to load models: ' + error.message);
  }
}

async function saveSettings() {
  try {
    config = {
      endpoint: endpointInput.value || 'http://localhost:11434',
      model1: model1Select.value,
      model2: model2Select.value,
      model3: model3Select.value,
      requestConfig: getRequestConfig(),
      responseConfig: getResponseConfig()
    };

    await window.botTesterAPI.saveConfig(config);
    showSuccess('Settings saved successfully!');
    setTimeout(() => showSuccess(''), 3000);
  } catch (error) {
    console.error('Error saving settings:', error);
    showError('Failed to save settings: ' + error.message);
  }
}

async function clearHistory() {
  if (confirm('Are you sure you want to clear all test history?')) {
    try {
      await window.botTesterAPI.clearHistory();
      testHistory = [];
      updateHistoryDisplay();
    } catch (error) {
      console.error('Error clearing history:', error);
      showError('Failed to clear history: ' + error.message);
    }
  }
}

function updateHistoryDisplay() {
  if (testHistory.length === 0) {
    historyContent.innerHTML = '<p class="empty-state">No test history yet</p>';
    return;
  }

  historyContent.innerHTML = testHistory.map((test, index) => {
    const tags = buildHistoryTags(test.requestConfig || {}, test.responseConfig || {});
    const tagsHtml = tags.length > 0
      ? `<div class="history-item-tags">${tags.map(t => `<span class="history-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    return `
      <div class="history-item" onclick="loadHistoryItem(${index})">
        <div class="history-item-query">${escapeHtml(test.query.substring(0, 50))}${test.query.length > 50 ? '...' : ''}</div>
        ${tagsHtml}
        <span class="history-item-status ${test.isCorrect ? 'success' : 'error'}">
          ${test.isCorrect ? '✓ Correct' : '✗ Incorrect'}
        </span>
      </div>`;
  }).join('');
}

function loadHistoryItem(index) {
  const test = testHistory[index];
  if (test) {
    displayTestResult(test);
  }
}

function setLoadingMessage(msg) {
  const el = document.getElementById('loadingMessage');
  if (el) el.textContent = msg;
}

function setBotActive(botNum, active) {
  const box = botNum === 1 ? document.querySelector('.bot1-box') : document.getElementById('bot2Box');
  const textEl = botNum === 1 ? bot1Query : bot2Response;
  box.classList.toggle('active', active);
  if (active) {
    textEl.textContent = 'Generating...';
    textEl.classList.remove('empty');
    textEl.classList.add('generating');
  } else {
    textEl.classList.remove('generating');
  }
}

// Main test execution
async function runTest() {
  if (!queryInput.value.trim()) {
    showError('Please enter a query');
    return;
  }

  // Read live values from UI — never use stale cached config for model/endpoint
  const model1   = model1Select.value;
  const model2   = model2Select.value;
  const model3   = model3Select.value;
  const endpoint = endpointInput.value || config.endpoint;

  if (!model1) {
    showError('Please select a model for Bot 1 in settings');
    return;
  }
  if (!model2 || !model3) {
    showError('Please configure Bot 2 and Bot 3 models in settings');
    return;
  }

  try {
    document.getElementById('inputSection').classList.add('collapsed');
    runTestBtn.disabled = true;
    showError('');
    resetUI();

    if (document.getElementById('req-randomize').checked) applyRandomRequestConfig();
    if (document.getElementById('res-randomize').checked) applyRandomResponseConfig();
    const requestConfig  = getRequestConfig();
    const responseConfig = getResponseConfig();

    // Step 1: Bot 1 — reformulate query with current personality/tone/vulnerability config
    setLoadingMessage('Calling Bot 1 (query generator)...');
    loadingSpinner.classList.remove('hidden');
    setBotActive(1, true);
    const { bot1Query: reformulated } = await window.botTesterAPI.runBot1(
      queryInput.value, model1, endpoint, requestConfig
    );
    setBotActive(1, false);
    bot1Query.textContent = reformulated;
    bot1Query.classList.remove('empty');

    // Step 2: Bot 2 — generate response
    setLoadingMessage('Calling Bot 2 (responder)...');
    setBotActive(2, true);
    const { bot2Response: responseText } = await window.botTesterAPI.runBot2(
      reformulated, model2, endpoint, responseConfig
    );
    setBotActive(2, false);
    bot2Response.textContent = responseText;
    bot2Response.classList.remove('empty');

    // Step 3: Bot 3 — evaluate
    setLoadingMessage('Calling Bot 3 (evaluator)...');
    evaluationSection.classList.remove('hidden');
    document.getElementById('bot3Loading').classList.remove('hidden');
    document.getElementById('evaluationContent').classList.add('hidden');

    const evaluation = await window.botTesterAPI.runBot3(
      reformulated, responseText, model3, endpoint
    );

    document.getElementById('bot3Loading').classList.add('hidden');
    document.getElementById('evaluationContent').classList.remove('hidden');

    const result = {
      query: reformulated,
      originalQuery: queryInput.value,
      bot2Response: responseText,
      isCorrect: evaluation.isCorrect,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      rawEvaluation: evaluation.rawEvaluation,
      requestConfig,
      responseConfig,
      timestamp: new Date().toISOString()
    };

    // Auto-save current config so next startup restores these exact values
    config = { endpoint, model1, model2, model3, requestConfig, responseConfig };
    await window.botTesterAPI.saveConfig(config);

    testHistory.unshift(result);
    await window.botTesterAPI.saveHistory(testHistory);
    updateHistoryDisplay();

    displayEvaluationResult(result);
  } catch (error) {
    console.error('Test error:', error);
    showError('Test failed: ' + error.message);
    resetUI();
  } finally {
    runTestBtn.disabled = false;
    loadingSpinner.classList.add('hidden');
    setBotActive(1, false);
    setBotActive(2, false);
  }
}

function displayEvaluationResult(result) {
  bot2Box.classList.remove('correct', 'incorrect');
  if (result.isCorrect) {
    bot2Box.classList.add('correct');
    evaluationBadge.className = 'evaluation-badge success';
    evaluationText.textContent = '✓ Correct Answer';
  } else {
    bot2Box.classList.add('incorrect');
    evaluationBadge.className = 'evaluation-badge error';
    evaluationText.textContent = '✗ Incorrect Answer';
  }
  evaluationBadge.style.display = 'block';

  evaluationConfidence.textContent = result.confidence + '%';
  evaluationReasoning.textContent = result.reasoning || result.rawEvaluation;
  evaluationSection.classList.remove('hidden');
  document.getElementById('bot3Loading').classList.add('hidden');
  document.getElementById('evaluationContent').classList.remove('hidden');

  const reqTags = buildConfigTags(result.requestConfig || {}, 'request');
  const resTags = buildConfigTags(result.responseConfig || {}, 'response');
  document.getElementById('requestConfigTags').innerHTML  = renderConfigTags(reqTags);
  document.getElementById('responseConfigTags').innerHTML = renderConfigTags(resTags);
  document.getElementById('configUsed').classList.remove('hidden');

  setTimeout(() => {
    document.querySelector('.results-section').scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function displayTestResult(result) {
  bot1Query.textContent = result.query;
  bot1Query.classList.remove('empty', 'generating');
  bot2Response.textContent = result.bot2Response;
  bot2Response.classList.remove('empty', 'generating');
  displayEvaluationResult(result);
}

function resetUI() {
  bot1Query.textContent = 'No query yet';
  bot1Query.classList.add('empty');
  bot1Query.classList.remove('generating');
  bot2Response.textContent = 'No response yet';
  bot2Response.classList.add('empty');
  bot2Response.classList.remove('generating');
  bot2Box.classList.remove('correct', 'incorrect', 'active');
  document.querySelector('.bot1-box').classList.remove('active');
  evaluationBadge.style.display = 'none';
  evaluationSection.classList.add('hidden');
  document.getElementById('configUsed').classList.add('hidden');
  document.getElementById('bot3Loading').classList.add('hidden');
  document.getElementById('evaluationContent').classList.remove('hidden');
}

function buildConfigTags(cfg, mode) {
  if (mode === 'request') {
    const tags = [];
    tags.push({ text: cfg.personality || 'neutral',  type: 'personality' });
    tags.push({ text: cfg.tone        || 'neutral',  type: 'tone' });
    if (cfg.badLanguage)        tags.push({ text: 'bad language',    type: 'flag' });
    if (cfg.aggressiveLanguage) tags.push({ text: 'aggressive lang', type: 'flag' });
    if (cfg.slowReader)         tags.push({ text: 'slow reader',     type: 'vuln' });
    if (cfg.englishNotFirst)    tags.push({ text: 'ESL',             type: 'vuln' });
    if (cfg.depression)         tags.push({ text: 'depression',      type: 'vuln' });
    if (cfg.suicidalSelfHarm)   tags.push({ text: 'self harm',       type: 'risk' });
    if (cfg.personalInjury)     tags.push({ text: 'personal injury', type: 'vuln' });
    if (cfg.hurtingOthers)      tags.push({ text: 'hurting others',  type: 'risk' });
    if (cfg.medicalIssues)      tags.push({ text: 'medical',         type: 'vuln' });
    if (cfg.pciData)            tags.push({ text: 'PCI / PAN',       type: 'sensitive' });
    if (cfg.financialAdvice)    tags.push({ text: 'financial advice',type: 'sensitive' });
    if (cfg.randomize)          tags.push({ text: 'randomized',      type: 'meta' });
    return tags;
  } else {
    const tags = [];
    tags.push({ text: cfg.personality || 'professional', type: 'personality' });
    tags.push({ text: cfg.tone        || 'helpful',      type: 'tone' });
    tags.push({ text: cfg.style       || 'concise',      type: 'style' });
    if (cfg.randomize) tags.push({ text: 'randomized', type: 'meta' });
    return tags;
  }
}

function renderConfigTags(tags) {
  return tags.map(t => `<span class="config-tag config-tag--${t.type}">${escapeHtml(t.text)}</span>`).join('');
}

function buildHistoryTags(reqCfg, resCfg) {
  const tags = [];
  if (reqCfg.personality && reqCfg.personality !== 'neutral')    tags.push(reqCfg.personality);
  if (reqCfg.tone        && reqCfg.tone        !== 'neutral')    tags.push(reqCfg.tone);
  if (reqCfg.suicidalSelfHarm)  tags.push('self harm');
  if (reqCfg.hurtingOthers)    tags.push('hurting others');
  if (reqCfg.pciData)           tags.push('PCI');
  if (reqCfg.financialAdvice)   tags.push('financial');
  if (reqCfg.depression)        tags.push('depression');
  if (reqCfg.medicalIssues)     tags.push('medical');
  if (resCfg.personality && resCfg.personality !== 'professional') tags.push(resCfg.personality);
  return tags.slice(0, 4);
}

function showError(message) {
  if (message) {
    errorMessage.textContent = message;
    errorMessage.className = 'error-message';
  } else {
    errorMessage.textContent = '';
    errorMessage.className = 'error-message hidden';
  }
}

function showSuccess(message) {
  if (message) {
    errorMessage.textContent = message;
    errorMessage.className = 'success-message';
  } else {
    errorMessage.textContent = '';
    errorMessage.className = 'error-message hidden';
  }
}

function closeModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateJestFile() {
  if (testHistory.length === 0) return null;

  const testCases = testHistory.map(h => ({
    name: (h.originalQuery || h.query).substring(0, 80),
    query: h.originalQuery || h.query,
    model1: config.model1,
    model2: config.model2,
    model3: config.model3,
    endpoint: config.endpoint,
    requestConfig:  h.requestConfig  || {},
    responseConfig: h.responseConfig || {}
  }));

  return `/**
 * Auto-generated Bot Tests — BotTester
 * Generated: ${new Date().toISOString()}
 *
 * Run:  npx jest bot-tests.test.js
 * Req:  Ollama (or compatible endpoint) running at ${config.endpoint}
 */

const { BotOrchestrator } = require('./src/bot-orchestrator');

const orchestrator = new BotOrchestrator();

const TEST_CASES = ${JSON.stringify(testCases, null, 2)};

describe('Bot Test Suite', () => {
  test.each(TEST_CASES)('$name', async (tc) => {
    const result = await orchestrator.runTest(
      tc.query,
      tc.model1,
      tc.model2,
      tc.model3,
      tc.endpoint,
      tc.requestConfig,
      tc.responseConfig
    );
    expect(result.isCorrect).toBe(true);
  });
});
`;
}

function generateJunitXml() {
  if (testHistory.length === 0) return null;

  const total    = testHistory.length;
  const failures = testHistory.filter(h => !h.isCorrect).length;
  const ts       = new Date().toISOString();

  const cases = testHistory.map(h => {
    const name      = escapeXml((h.originalQuery || h.query).substring(0, 100));
    const classname = escapeXml(`BotTester.${h.requestConfig?.personality || 'neutral'}`);
    if (h.isCorrect) {
      return `    <testcase name="${name}" classname="${classname}" time="0"/>`;
    }
    const detail = escapeXml(`Confidence: ${h.confidence}%\nReasoning: ${h.reasoning || h.rawEvaluation || ''}`);
    return `    <testcase name="${name}" classname="${classname}" time="0">
      <failure message="Incorrect response" type="AssertionError">${detail}</failure>
    </testcase>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="BotTester" tests="${total}" failures="${failures}" time="0" timestamp="${ts}">
  <testsuite name="Bot Test Suite" tests="${total}" failures="${failures}" time="0">
${cases}
  </testsuite>
</testsuites>
`;
}

async function exportAsJest() {
  const content = generateJestFile();
  if (!content) { showError('No test history to export.'); return; }
  try {
    const saved = await window.botTesterAPI.exportFile('bot-tests.test.js', content);
    if (saved) showSuccess(`Saved: ${saved}`);
  } catch (e) {
    showError('Export failed: ' + e.message);
  }
}

async function exportAsJunit() {
  const content = generateJunitXml();
  if (!content) { showError('No test history to export.'); return; }
  try {
    const saved = await window.botTesterAPI.exportFile('bot-test-results.xml', content);
    if (saved) showSuccess(`Saved: ${saved}`);
  } catch (e) {
    showError('Export failed: ' + e.message);
  }
}

// Background particle network — header only
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  const header = document.querySelector('.header');
  const DOTS = 45, LINK_DIST = 120, SPEED = 0.28;
  let particles = [];

  function resize() {
    canvas.width  = header.offsetWidth;
    canvas.height = header.offsetHeight;
  }

  function spawn() {
    particles = Array.from({ length: DOTS }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
      r: Math.random() * 1.4 + 0.6
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.filter = 'blur(1px)';
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < LINK_DIST) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(99,155,255,${(1 - d / LINK_DIST) * 0.14})`;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(99,155,255,0.3)';
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }
    requestAnimationFrame(draw);
  }

  resize(); spawn(); draw();
  window.addEventListener('resize', () => { resize(); spawn(); });
}

// 3D morphing icon: cube → sphere → pyramid
function initIconCanvas() {
  const cvs = document.getElementById('iconCanvas');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const SHAPES = ['cube', 'sphere', 'pyramid'];
  const HOLD = 150, FADE = 45;
  const CYCLE = (HOLD + FADE) * SHAPES.length;
  let frame = 0;

  const ease = t => (1 - Math.cos(t * Math.PI)) / 2;

  const rotVec = (x, y, z, rx, ry) => {
    const y1 = y * Math.cos(rx) - z * Math.sin(rx);
    const z1 = y * Math.sin(rx) + z * Math.cos(rx);
    const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
    const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
    return [x2, y1, z2];
  };

  const proj = (x, y, z) => {
    const f = 4 / (4 + z);
    return [W / 2 + x * f * W * 0.38, H / 2 + y * f * H * 0.38];
  };

  const drawWireframe = (verts, edges, alpha) => {
    ctx.strokeStyle = `rgba(96,165,250,${alpha})`;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (const [a, b] of edges) {
      const [ax, ay] = proj(...verts[a]);
      const [bx, by] = proj(...verts[b]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.fillStyle = `rgba(96,165,250,${alpha * 0.9})`;
    for (const v of verts) {
      const [px, py] = proj(...v);
      ctx.beginPath(); ctx.arc(px, py, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  };

  const getCube = (rx, ry) => {
    const s = 0.8;
    const raw = [[-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]];
    return {
      verts: raw.map(([x,y,z]) => rotVec(x,y,z,rx,ry)),
      edges: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
    };
  };

  const getPyramid = (rx, ry) => {
    const s = 0.85;
    const raw = [[0,0.9,0],[-s,-s,-s],[s,-s,-s],[s,-s,s],[-s,-s,s]];
    return {
      verts: raw.map(([x,y,z]) => rotVec(x,y,z,rx,ry)),
      edges: [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]]
    };
  };

  const drawSphere = (rx, ry, alpha) => {
    ctx.strokeStyle = `rgba(96,165,250,${alpha * 0.55})`;
    ctx.lineWidth = 0.8;
    const r = 0.82, LATS = 5, LNGS = 6, STEPS = 36;
    for (let i = 1; i < LATS; i++) {
      const phi = (i / LATS) * Math.PI;
      const yr = Math.cos(phi) * r, xr = Math.sin(phi) * r;
      ctx.beginPath();
      for (let j = 0; j <= STEPS; j++) {
        const theta = (j / STEPS) * Math.PI * 2;
        const [px, py] = proj(...rotVec(xr * Math.cos(theta), yr, xr * Math.sin(theta), rx, ry));
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    for (let i = 0; i < LNGS; i++) {
      const theta = (i / LNGS) * Math.PI;
      ctx.beginPath();
      for (let j = 0; j <= STEPS; j++) {
        const phi = (j / STEPS) * Math.PI;
        const [px, py] = proj(...rotVec(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r,
          Math.sin(phi) * Math.sin(theta) * r,
          rx, ry
        ));
        j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  };

  const drawShape = (name, rx, ry, alpha) => {
    if (name === 'cube')     { const {verts,edges} = getCube(rx,ry);    drawWireframe(verts,edges,alpha); }
    else if (name === 'sphere')   { drawSphere(rx, ry, alpha); }
    else if (name === 'pyramid')  { const {verts,edges} = getPyramid(rx,ry); drawWireframe(verts,edges,alpha); }
  };

  const loop = () => {
    ctx.clearRect(0, 0, W, H);
    const rx = frame * 0.006, ry = frame * 0.011;
    const t = frame % CYCLE;
    const idx = Math.floor(t / (HOLD + FADE)) % SHAPES.length;
    const phaseT = t % (HOLD + FADE);

    if (phaseT < HOLD) {
      drawShape(SHAPES[idx], rx, ry, 0.9);
    } else {
      const p = ease((phaseT - HOLD) / FADE);
      drawShape(SHAPES[idx], rx, ry, 0.9 * (1 - p));
      drawShape(SHAPES[(idx + 1) % SHAPES.length], rx, ry, 0.9 * p);
    }
    frame++;
    requestAnimationFrame(loop);
  };

  loop();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  initBgCanvas();
  initIconCanvas();

  // Close config dropdowns when clicking outside them
  document.addEventListener('click', (e) => {
    [1, 2].forEach(n => {
      if (!e.target.closest(`#bot${n}ConfigBtn`) && !e.target.closest(`#bot${n}ConfigPanel`)) {
        document.getElementById(`bot${n}ConfigPanel`).classList.add('hidden');
        document.getElementById(`bot${n}ConfigBtn`).classList.remove('active');
      }
    });
  });
});

runTestBtn.addEventListener('click', runTest);
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    runTest();
  }
});

settingsBtn.addEventListener('click', toggleSettings);
historyBtn.addEventListener('click', toggleHistory);

document.getElementById('collapseBtn').addEventListener('click', () => {
  document.getElementById('inputSection').classList.toggle('collapsed');
});

loadModelsBtn.addEventListener('click', loadAvailableModels);
saveSettingsBtn.addEventListener('click', saveSettings);
clearHistoryBtn.addEventListener('click', clearHistory);

// Allow Enter in settings to save
endpointInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    loadAvailableModels();
  }
});
