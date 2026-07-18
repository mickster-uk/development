window.ABRun = (() => {
  const S = window.ABState;
  const C = window.ABCanvas;

  let running = false;
  let invocations = [];
  let selectedInvocation = null;
  let follow = true;
  let tokenBuffers = new Map();
  let statusEl, runBtn, listEl, detailEl;
  let fmt = { json: true, md: true };
  let collapsedSections = new Set();

  function init() {
    statusEl = document.getElementById('run-status');
    runBtn = document.getElementById('btn-run');
    listEl = document.getElementById('invocation-list');
    detailEl = document.getElementById('invocation-detail');

    runBtn.addEventListener('click', () => (running ? cancel() : start()));
    window.agentbase.onExecEvent((evt) => handleEvent(evt));
  }

  async function start() {
    if (!S.project) return;
    await S.save();
    const input = document.getElementById('run-input').value.trim();
    const res = await window.agentbase.runProject(S.project.id, input);
    if (!res.success) {
      statusEl.textContent = res.error;
      return;
    }
    running = true;
    invocations = [];
    selectedInvocation = null;
    follow = true;
    tokenBuffers = new Map();
    runBtn.textContent = 'Stop';
    runBtn.classList.add('running');
    C.resetRunStates();
    renderList();
    renderDetail();
    document.getElementById('app').classList.remove('drawer-collapsed');
    activateTab('panel-debug');
  }

  async function cancel() {
    await window.agentbase.cancelRun();
  }

  function activateTab(panelId) {
    for (const tab of document.querySelectorAll('.drawer-tabs .tab')) {
      const active = tab.dataset.panel === panelId;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.drawer-panel')) {
      panel.classList.toggle('active', panel.id === panelId);
    }
  }

  function nodeName(nodeId) {
    return S.node(nodeId)?.name || nodeId;
  }

  function edgeLabel(edgeId) {
    const edge = S.edge(edgeId);
    return edge ? `${nodeName(edge.from)} → ${nodeName(edge.to)}` : edgeId;
  }

  function pushInvocation(inv) {
    invocations.push(inv);
    renderList();
    if (follow) {
      selectedInvocation = inv;
      renderDetail();
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  function handleEvent(evt) {
    const t = evt.type;
    if (t === 'run-started') {
      statusEl.textContent = 'Running…';
    } else if (t === 'node-started') {
      C.setNodeState(evt.nodeId, 'running');
      statusEl.textContent = `Running ${nodeName(evt.nodeId)}…`;
      tokenBuffers.set(evt.nodeId, '');
      pushInvocation({ ts: evt.ts, kind: 'agent call', title: nodeName(evt.nodeId), status: 'info', nodeId: evt.nodeId, request: evt.data.request, response: '', live: true });
    } else if (t === 'node-stream-reset') {
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) {
        inv.response = '';
        if (selectedInvocation === inv) renderDetail();
      }
    } else if (t === 'node-token') {
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) {
        inv.response += evt.data.token;
        if (selectedInvocation === inv) renderDetail();
      }
    } else if (t === 'node-finished') {
      C.setNodeState(evt.nodeId, 'passed');
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) {
        inv.response = evt.data.output;
        inv.status = 'pass';
        inv.live = false;
      }
      renderList();
      if (selectedInvocation?.nodeId === evt.nodeId) renderDetail();
    } else if (t === 'node-error') {
      C.setNodeState(evt.nodeId, evt.data.cancelled ? 'cancelled' : 'failed');
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) {
        inv.status = 'error';
        inv.response = evt.data.message;
        inv.live = false;
      }
      renderList();
    } else if (t === 'node-skipped') {
      C.setNodeState(evt.nodeId, 'skipped');
      pushInvocation({ ts: evt.ts, kind: 'skipped', title: nodeName(evt.nodeId), status: 'skipped', response: evt.data.reason });
    } else if (t === 'gate-started') {
      C.setEdgeVerdict(evt.edgeId, null, true);
      pushInvocation({ ts: evt.ts, kind: 'criteria eval', title: edgeLabel(evt.edgeId), status: 'info', edgeId: evt.edgeId, request: null, response: '', live: true });
    } else if (t === 'gate-finished') {
      const outcome = evt.data.outcome === 'fail-retry' ? 'fail' : evt.data.outcome;
      C.setEdgeVerdict(evt.edgeId, outcome, false);
      const inv = invocations.findLast((i) => i.edgeId === evt.edgeId && i.live);
      if (inv) {
        inv.status = outcome;
        inv.request = evt.data.request;
        inv.response = formatGateResult(evt.data);
        inv.raw = evt.data.raw;
        inv.live = false;
      }
      renderList();
      if (selectedInvocation?.edgeId === evt.edgeId) renderDetail();
    } else if (t === 'gate-skipped') {
      C.setEdgeVerdict(evt.edgeId, 'skipped', false);
    } else if (t === 'run-paused') {
      statusEl.textContent = `Paused — ${evt.data.reason} (waiting for Ollama…)`;
    } else if (t === 'run-resumed') {
      statusEl.textContent = 'Resumed…';
    } else if (t === 'run-finished') {
      running = false;
      runBtn.textContent = 'Run';
      runBtn.classList.remove('running');
      statusEl.textContent = `Run ${evt.data.status} — ${new Date().toLocaleTimeString('en-GB')}`;
      window.ABAudit?.refresh();
    } else if (t === 'run-error') {
      statusEl.textContent = evt.data.message;
    }
  }

  function formatGateResult(d) {
    const head = d.outcome === 'pass' || d.outcome === 'fail' || d.outcome === 'fail-retry'
      ? `${d.outcome.toUpperCase()} — score ${d.score}/${d.threshold} required`
      : d.outcome.toUpperCase();
    return `${head}\n\n${d.reason || ''}`;
  }

  function renderList() {
    listEl.innerHTML = '';
    for (const inv of invocations) {
      const row = document.createElement('div');
      row.className = `invocation-row${inv === selectedInvocation ? ' selected' : ''}`;
      const dot = document.createElement('span');
      dot.className = `dot ${inv.status}`;
      const time = document.createElement('span');
      time.textContent = new Date(inv.ts).toLocaleTimeString('en-GB');
      const title = document.createElement('span');
      title.textContent = inv.title;
      title.style.flex = '1';
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = inv.kind;
      row.append(dot, time, title, kind);
      row.addEventListener('click', () => {
        follow = false;
        selectedInvocation = inv;
        renderList();
        renderDetail();
      });
      listEl.appendChild(row);
    }
  }

  function setFormatting(cfg) {
    fmt = { json: cfg.debugJsonColour !== false, md: cfg.debugRenderMarkdown !== false };
    if (selectedInvocation) renderDetail();
  }

  function colourJson(str) {
    const safe = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return safe.replace(
      /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'j-num';
        if (/^"/.test(match)) cls = /:$/.test(match) ? 'j-key' : 'j-str';
        else if (match === 'true' || match === 'false') cls = 'j-bool';
        else if (match === 'null') cls = 'j-null';
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  function addSection(title, content, mode) {
    const section = document.createElement('details');
    section.className = 'detail-section';
    section.open = !collapsedSections.has(title);
    const summary = document.createElement('summary');
    summary.textContent = title;
    section.appendChild(summary);
    section.addEventListener('toggle', () => {
      if (section.open) collapsedSections.delete(title);
      else collapsedSections.add(title);
    });
    if (mode === 'json') {
      const pre = document.createElement('pre');
      pre.innerHTML = colourJson(content);
      section.appendChild(pre);
    } else if (mode === 'md') {
      const div = document.createElement('div');
      div.className = 'md-render';
      div.innerHTML = window.agentbase.parseMarkdown(content);
      for (const a of div.querySelectorAll('a')) a.addEventListener('click', (e) => e.preventDefault());
      section.appendChild(div);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = content;
      section.appendChild(pre);
    }
    detailEl.appendChild(section);
  }

  function renderDetail() {
    const inv = selectedInvocation;
    if (!inv) {
      detailEl.innerHTML = '<div class="empty-hint">Select an invocation to inspect its request and response.</div>';
      return;
    }
    detailEl.innerHTML = '';
    addSection('Request', inv.request ? JSON.stringify(inv.request, null, 2) : '(pending)', inv.request && fmt.json ? 'json' : 'plain');
    addSection('Response', inv.response || '(pending)', inv.response && fmt.md && !inv.live ? 'md' : 'plain');
    if (inv.raw) addSection('Raw gate output', inv.raw, 'plain');
  }

  function showRun(run) {
    invocations = [];
    selectedInvocation = null;
    follow = false;
    for (const evt of run.events || []) handleHistorical(evt, run);
    activateTab('panel-debug');
    renderList();
    renderDetail();
  }

  function handleHistorical(evt, run) {
    const nodeNameIn = (id) => run.snapshot?.nodes.find((n) => n.id === id)?.name || id;
    if (evt.type === 'node-started') {
      invocations.push({ ts: evt.ts, kind: 'agent call', title: nodeNameIn(evt.nodeId), status: 'info', nodeId: evt.nodeId, request: evt.data.request, response: '', live: true });
    } else if (evt.type === 'node-finished') {
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) { inv.response = evt.data.output; inv.status = 'pass'; inv.live = false; }
    } else if (evt.type === 'node-error') {
      const inv = invocations.findLast((i) => i.nodeId === evt.nodeId && i.live);
      if (inv) { inv.status = 'error'; inv.response = evt.data.message; inv.live = false; }
    } else if (evt.type === 'gate-finished') {
      invocations.push({ ts: evt.ts, kind: 'criteria eval', title: 'gate', status: evt.data.outcome === 'fail-retry' ? 'fail' : evt.data.outcome, request: evt.data.request, response: formatGateResult(evt.data), raw: evt.data.raw });
    } else if (evt.type === 'node-skipped') {
      invocations.push({ ts: evt.ts, kind: 'skipped', title: nodeNameIn(evt.nodeId), status: 'skipped', response: evt.data.reason });
    }
  }

  return { init, showRun, activateTab, setFormatting, isRunning: () => running };
})();
