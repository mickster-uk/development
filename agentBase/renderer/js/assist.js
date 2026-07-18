window.ABAssist = (() => {
  const S = window.ABState;
  let dialog, transcript, counter, answerInput, errorBox;
  let dropPos = null;
  let lastResult = null;
  let lastOp = null;
  let models = [];
  let seq = 0;

  function init() {
    dialog = document.getElementById('assist-dialog');
    transcript = document.getElementById('assist-transcript');
    counter = document.getElementById('assist-counter');
    answerInput = document.getElementById('assist-answer');
    errorBox = document.getElementById('assist-error');

    document.getElementById('assist-begin').addEventListener('click', () => begin());
    document.getElementById('assist-desc').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) begin();
    });
    document.getElementById('assist-answer-form').addEventListener('submit', (e) => submitAnswer(e));
    document.getElementById('assist-skip').addEventListener('click', () => skip());
    document.getElementById('assist-generate').addEventListener('click', () => generateNow());
    document.getElementById('assist-retry').addEventListener('click', () => retry());
    document.getElementById('assist-regenerate').addEventListener('click', () => regenerate());
    document.getElementById('assist-add').addEventListener('click', () => addToCanvas());
    for (const id of ['assist-cancel-1', 'assist-cancel-2', 'assist-cancel-3']) {
      document.getElementById(id).addEventListener('click', () => close());
    }
    dialog.addEventListener('cancel', () => window.agentbase.cancelInterview());
  }

  function setModels(list) {
    models = list;
  }

  async function runTurn(promise) {
    const mySeq = seq;
    const res = await promise;
    if (mySeq !== seq) return;
    handleTurn(res);
  }

  function open(pos) {
    seq++;
    dropPos = pos;
    lastResult = null;
    lastOp = null;
    transcript.innerHTML = '';
    errorBox.hidden = true;
    document.getElementById('assist-desc').value = '';
    answerInput.value = '';
    showPhase('describe');
    dialog.showModal();
    document.getElementById('assist-desc').focus();
  }

  function close() {
    seq++;
    window.agentbase.cancelInterview();
    if (dialog.open) dialog.close();
  }

  function showPhase(phase) {
    for (const p of ['describe', 'interview', 'preview']) {
      document.getElementById(`assist-phase-${p}`).hidden = p !== phase;
    }
  }

  function bubble(cls, text) {
    const el = document.createElement('div');
    el.className = `bubble ${cls}`;
    el.textContent = text;
    transcript.appendChild(el);
    transcript.scrollTop = transcript.scrollHeight;
    return el;
  }

  function thinking(label) {
    const el = bubble('q thinking', label || '');
    for (let i = 0; i < 3; i++) el.appendChild(document.createElement('span'));
    return el;
  }

  function clearThinking() {
    transcript.querySelector('.thinking')?.remove();
  }

  function setBusy(busy) {
    for (const id of ['assist-answer', 'assist-skip', 'assist-generate']) {
      document.getElementById(id).disabled = busy;
    }
  }

  async function begin() {
    const desc = document.getElementById('assist-desc').value.trim();
    if (!desc) return;
    showPhase('interview');
    counter.textContent = 'Thinking…';
    bubble('a', desc);
    thinking();
    setBusy(true);
    lastOp = 'turn';
    await runTurn(window.agentbase.startInterview(desc));
  }

  async function submitAnswer(e) {
    e.preventDefault();
    const text = answerInput.value.trim();
    if (!text) return;
    answerInput.value = '';
    bubble('a', text);
    thinking();
    setBusy(true);
    lastOp = 'turn';
    await runTurn(window.agentbase.answerInterview(text));
  }

  async function skip() {
    bubble('a skipped', 'Skipped — decide yourself');
    thinking();
    setBusy(true);
    lastOp = 'turn';
    await runTurn(window.agentbase.answerInterview('No preference — make a sensible choice yourself.'));
  }

  async function generateNow() {
    thinking('Writing the agent configuration');
    setBusy(true);
    lastOp = 'generate';
    await runTurn(window.agentbase.generateAgent());
  }

  async function retry() {
    errorBox.hidden = true;
    thinking(lastOp === 'generate' ? 'Writing the agent configuration' : '');
    setBusy(true);
    await runTurn(lastOp === 'generate' ? window.agentbase.generateAgent() : window.agentbase.answerInterview(''));
  }

  async function regenerate() {
    const btn = document.getElementById('assist-regenerate');
    btn.disabled = true;
    btn.textContent = 'Regenerating…';
    lastOp = 'generate';
    await runTurn(window.agentbase.generateAgent());
    btn.disabled = false;
    btn.textContent = 'Regenerate';
  }

  function handleTurn(res) {
    clearThinking();
    setBusy(false);
    if (!dialog.open) return;
    const turn = res.success ? res.turn : { type: 'error', error: res.error, retryable: true };

    if (turn.type === 'question') {
      errorBox.hidden = true;
      counter.textContent = `Question ${turn.index} · up to ${turn.max}`;
      bubble('q', turn.question);
      answerInput.focus();
    } else if (turn.type === 'result') {
      errorBox.hidden = true;
      lastResult = turn.result;
      fillPreview();
      showPhase('preview');
      document.getElementById('assist-name').focus();
    } else if (turn.type === 'error') {
      errorBox.hidden = false;
      document.getElementById('assist-retry').hidden = turn.retryable === false;
      document.getElementById('assist-error-text').textContent = turn.transport
        ? `${turn.error} Start Ollama, then try again.`
        : turn.error;
      if (!document.getElementById('assist-phase-interview').hidden) answerInput.focus();
    }
  }

  function fillPreview() {
    document.getElementById('assist-name').value = lastResult.name;

    const select = document.getElementById('assist-model');
    select.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Project default';
    select.appendChild(def);
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    }
    select.value = lastResult.model && models.includes(lastResult.model) ? lastResult.model : '';

    document.getElementById('assist-prompt').value = lastResult.prompt;

    const meta = document.getElementById('assist-meta');
    meta.textContent = lastResult.referencedDefinitions.length
      ? `${lastResult.questionsAsked} question(s) asked · references: ${lastResult.referencedDefinitions.join(', ')}`
      : `${lastResult.questionsAsked} question(s) asked`;

    renderTests();
  }

  function renderTests() {
    const wrap = document.getElementById('assist-tests');
    wrap.innerHTML = '';
    if (!lastResult.tests.length) {
      wrap.innerHTML = '<div class="empty-hint">No tests suggested.</div>';
      return;
    }
    for (const t of lastResult.tests) {
      const item = document.createElement('div');
      item.className = 'test-item';
      const head = document.createElement('div');
      head.className = 'test-head';
      const label = document.createElement('strong');
      label.textContent = t.expect.label;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn del';
      del.title = 'Remove test';
      del.appendChild(window.ABIcons.icon('trash', 13));
      del.addEventListener('click', () => {
        lastResult.tests = lastResult.tests.filter((x) => x.id !== t.id);
        renderTests();
      });
      head.append(label, del);
      const input = document.createElement('div');
      input.className = 'test-line';
      input.textContent = `Input: ${t.input}`;
      const crit = document.createElement('div');
      crit.className = 'test-line';
      crit.textContent = `Expect: ${t.expect.text}`;
      item.append(head, input, crit);
      wrap.appendChild(item);
    }
  }

  function addToCanvas() {
    const preset = {
      name: document.getElementById('assist-name').value.trim() || lastResult.name,
      prompt: document.getElementById('assist-prompt').value,
      model: document.getElementById('assist-model').value || null,
      tests: lastResult.tests
    };
    S.addNode(dropPos.x, dropPos.y, preset);
    close();
    document.getElementById('canvas-wrap').focus();
  }

  return { init, open, setModels };
})();
