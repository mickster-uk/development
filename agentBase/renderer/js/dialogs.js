window.ABDialogs = (() => {
  const S = window.ABState;
  let templates = { builtin: [], user: [] };
  let critDialog, critForm, critList, critSearch;
  let selectedTemplate = null;
  let pending = null;

  function init() {
    critDialog = document.getElementById('criteria-dialog');
    critForm = document.getElementById('criteria-form');
    critList = document.getElementById('criteria-template-list');
    critSearch = document.getElementById('criteria-search');

    critSearch.addEventListener('input', () => renderTemplates());
    document.getElementById('crit-cancel').addEventListener('click', () => closeCriteria(false));
    critDialog.addEventListener('cancel', () => closeCriteria(false));
    critForm.addEventListener('submit', (e) => submitCriteria(e));

    const threshold = document.getElementById('crit-threshold');
    threshold.addEventListener('input', () => {
      document.getElementById('crit-threshold-value').textContent = threshold.value;
    });
    const onFail = document.getElementById('crit-onfail');
    onFail.addEventListener('change', () => syncOnFailRows());

    const settingsDialog = document.getElementById('settings-dialog');
    document.getElementById('btn-settings').addEventListener('click', () => openSettings());
    document.getElementById('set-cancel').addEventListener('click', () => settingsDialog.close());
    document.getElementById('settings-form').addEventListener('submit', () => saveSettings());
  }

  async function refreshTemplates() {
    const res = await window.agentbase.listCriteria();
    if (res.success) templates = { builtin: res.builtin, user: res.user };
    renderRegistry();
  }

  function allTemplates() {
    return [...templates.user, ...templates.builtin];
  }

  function renderRegistry() {
    const list = document.getElementById('registry-list');
    list.innerHTML = '';
    for (const t of allTemplates()) {
      const li = document.createElement('li');
      li.title = t.question || t.text;
      const name = document.createElement('span');
      name.textContent = t.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = t.builtin ? 'built-in' : 'yours';
      li.append(name, meta);
      if (!t.builtin) {
        const del = document.createElement('button');
        del.className = 'icon-btn del';
        del.textContent = '×';
        del.title = 'Delete template';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.agentbase.deleteCriteria(t.id);
          refreshTemplates();
        });
        li.appendChild(del);
      }
      list.appendChild(li);
    }
  }

  function sourceTests() {
    if (!pending?.from) return [];
    return (S.node(pending.from)?.tests || []).map((t) => ({
      id: null,
      name: t.expect.label,
      question: t.expect.text,
      text: t.expect.text,
      threshold: t.expect.threshold,
      fromTest: true
    }));
  }

  function renderTemplates() {
    const q = critSearch.value.toLowerCase();
    critList.innerHTML = '';
    const blank = { id: null, name: 'Blank', question: 'Start from scratch', text: '' };
    const matches = (t) => !q || t.name.toLowerCase().includes(q) || (t.question || '').toLowerCase().includes(q);
    for (const t of [...sourceTests().filter(matches), ...allTemplates().filter(matches), blank]) {
      const li = document.createElement('li');
      li.classList.toggle('selected', selectedTemplate?.id === t.id && selectedTemplate?.name === t.name);
      li.classList.toggle('from-test', !!t.fromTest);
      const name = document.createElement('div');
      name.className = 'tpl-name';
      name.textContent = t.fromTest ? `Node test: ${t.name}` : t.name;
      const question = document.createElement('div');
      question.className = 'tpl-q';
      question.textContent = t.question || '';
      li.append(name, question);
      li.addEventListener('click', () => applyTemplate(t));
      critList.appendChild(li);
    }
  }

  function applyTemplate(t) {
    selectedTemplate = t;
    document.getElementById('crit-name').value = t.id || t.fromTest ? t.name : '';
    document.getElementById('crit-prompt').value = t.text || '';
    document.getElementById('crit-threshold').value = t.threshold ?? 7;
    document.getElementById('crit-threshold-value').textContent = t.threshold ?? 7;
    renderTemplates();
  }

  function syncOnFailRows() {
    const onFail = document.getElementById('crit-onfail').value;
    document.getElementById('crit-retry-row').hidden = onFail !== 'retry';
    document.getElementById('crit-route-row').hidden = onFail !== 'route';
    if (onFail === 'route') {
      const select = document.getElementById('crit-routeto');
      select.innerHTML = '';
      const exclude = pending ? [pending.from, pending.to] : [];
      for (const n of S.project.nodes.filter((n) => !exclude.includes(n.id))) {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = n.name;
        select.appendChild(opt);
      }
    }
  }

  function openCriteria({ from, to, edgeId, resolve }) {
    pending = { from, to, edgeId, resolve };
    selectedTemplate = null;
    const existing = edgeId ? S.edge(edgeId)?.criteria : null;
    document.getElementById('crit-name').value = existing?.label || '';
    document.getElementById('crit-prompt').value = existing?.text || '';
    document.getElementById('crit-threshold').value = existing?.threshold ?? 7;
    document.getElementById('crit-threshold-value').textContent = existing?.threshold ?? 7;
    document.getElementById('crit-onfail').value = existing?.onFail || 'block';
    document.getElementById('crit-retrymax').value = existing?.retryMax ?? 2;
    document.getElementById('crit-save-template').checked = false;
    critSearch.value = '';
    syncOnFailRows();
    if (existing?.onFail === 'route' && existing.routeTo) {
      document.getElementById('crit-routeto').value = existing.routeTo;
    }
    renderTemplates();
    critDialog.showModal();
    critSearch.focus();
  }

  async function submitCriteria(e) {
    e.preventDefault();
    const criteria = {
      templateId: selectedTemplate?.id || null,
      label: document.getElementById('crit-name').value.trim() || 'Criteria',
      text: document.getElementById('crit-prompt').value.trim(),
      threshold: Number(document.getElementById('crit-threshold').value),
      onFail: document.getElementById('crit-onfail').value,
      retryMax: Number(document.getElementById('crit-retrymax').value) || 2,
      routeTo: document.getElementById('crit-onfail').value === 'route' ? document.getElementById('crit-routeto').value : null
    };
    if (!criteria.text) return;

    if (document.getElementById('crit-save-template').checked) {
      await window.agentbase.saveCriteria({
        name: criteria.label,
        question: '',
        text: criteria.text,
        threshold: criteria.threshold
      });
      refreshTemplates();
    }

    critDialog.close();
    const p = pending;
    pending = null;
    p?.resolve(criteria);
  }

  function closeCriteria(submitted) {
    if (submitted) return;
    if (critDialog.open) critDialog.close();
    const p = pending;
    pending = null;
    p?.resolve(null);
  }

  async function openSettings() {
    const res = await window.agentbase.getConfig();
    if (!res.success) return;
    const cfg = res.config;
    document.getElementById('set-endpoint').value = cfg.endpoint;
    document.getElementById('set-maxsteps').value = cfg.maxSteps;
    document.getElementById('set-timeout').value = cfg.nodeTimeoutMs;
    document.getElementById('set-guided').value = cfg.guidedCreate || 'ask';
    document.getElementById('set-defs').value = cfg.definitionsPath || '';
    document.getElementById('set-saveruns').checked = !!cfg.saveRuns;
    document.getElementById('set-savepath').value = cfg.saveRunsPath || '';
    document.getElementById('set-fmt-json').checked = cfg.debugJsonColour !== false;
    document.getElementById('set-fmt-md').checked = cfg.debugRenderMarkdown !== false;

    const modelsRes = await window.agentbase.listModels();
    const models = modelsRes.success ? modelsRes.models : [];
    for (const [id, current, extra] of [['set-model', cfg.defaultModel, null], ['set-gatemodel', cfg.gateModel, 'Same as node model'], ['set-assistmodel', cfg.assistModel, 'Same as default model']]) {
      const select = document.getElementById(id);
      select.innerHTML = '';
      if (extra) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = extra;
        select.appendChild(opt);
      }
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
      }
      if (current && !models.includes(current)) {
        const opt = document.createElement('option');
        opt.value = current;
        opt.textContent = `${current} (not installed)`;
        select.appendChild(opt);
      }
      select.value = current || '';
    }
    document.getElementById('settings-dialog').showModal();
  }

  async function saveSettings() {
    const res = await window.agentbase.setConfig({
      endpoint: document.getElementById('set-endpoint').value.trim().replace(/\/$/, ''),
      defaultModel: document.getElementById('set-model').value,
      gateModel: document.getElementById('set-gatemodel').value || null,
      assistModel: document.getElementById('set-assistmodel').value || null,
      guidedCreate: document.getElementById('set-guided').value,
      definitionsPath: document.getElementById('set-defs').value.trim(),
      saveRuns: document.getElementById('set-saveruns').checked,
      saveRunsPath: document.getElementById('set-savepath').value.trim(),
      debugJsonColour: document.getElementById('set-fmt-json').checked,
      debugRenderMarkdown: document.getElementById('set-fmt-md').checked,
      maxSteps: Number(document.getElementById('set-maxsteps').value) || 50,
      nodeTimeoutMs: Number(document.getElementById('set-timeout').value) || 120000
    });
    if (res.success) window.ABRun.setFormatting(res.config);
  }

  function requestCriteria(from, to) {
    return new Promise((resolve) => openCriteria({ from, to, resolve }));
  }

  function editCriteria(edgeId) {
    const edge = S.edge(edgeId);
    return new Promise((resolve) => openCriteria({ from: edge.from, to: edge.to, edgeId, resolve }));
  }

  return { init, refreshTemplates, requestCriteria, editCriteria };
})();
