window.ABInspector = (() => {
  const S = window.ABState;
  let body;
  let models = [];
  let onEditCriteria = null;

  function init(options) {
    body = document.getElementById('inspector-body');
    onEditCriteria = options.onEditCriteria;
    S.onChange(() => render());
  }

  function setModels(list) {
    models = list;
    render();
  }

  function field(labelText, control) {
    const label = document.createElement('label');
    label.textContent = labelText;
    label.appendChild(control);
    return label;
  }

  function modelSelect(current) {
    const select = document.createElement('select');
    select.className = 'input';
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
    select.value = current || '';
    return select;
  }

  function render() {
    if (!body) return;
    body.innerHTML = '';
    if (!S.project) {
      body.innerHTML = '<div class="empty-hint">Create or open a project to begin.</div>';
      return;
    }

    const { kind, id } = S.selection;
    if (kind === 'node') renderNode(S.node(id));
    else if (kind === 'edge') renderEdge(S.edge(id));
    else renderProject();
  }

  function renderNode(node) {
    if (!node) return;
    const h = document.createElement('h3');
    h.textContent = `${node.role === 'orchestrator' ? 'Orchestrator' : 'Agent'} — ${node.name}`;
    body.appendChild(h);

    const name = document.createElement('input');
    name.className = 'input';
    name.value = node.name;
    name.addEventListener('change', () => S.updateNode(node.id, { name: name.value.trim() || node.name }));
    body.appendChild(field('Name', name));

    const role = document.createElement('select');
    role.className = 'input';
    for (const r of ['orchestrator', 'agent', 'subagent']) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      role.appendChild(opt);
    }
    role.value = node.role;
    role.addEventListener('change', () => S.updateNode(node.id, { role: role.value }));
    body.appendChild(field('Role', role));

    const model = modelSelect(node.model);
    model.addEventListener('change', () => S.updateNode(node.id, { model: model.value || null }));
    body.appendChild(field('Model', model));

    const prompt = document.createElement('textarea');
    prompt.className = 'input';
    prompt.rows = 10;
    prompt.value = node.prompt || '';
    prompt.placeholder = 'System prompt — who is this agent and what does it do?';
    prompt.addEventListener('change', () => S.updateNode(node.id, { prompt: prompt.value }));
    body.appendChild(field('System prompt', prompt));

    if (node.tests?.length) {
      const list = document.createElement('div');
      list.className = 'test-list';
      for (const t of node.tests) {
        const item = document.createElement('div');
        item.className = 'test-item';
        const head = document.createElement('div');
        head.className = 'test-head';
        const label = document.createElement('strong');
        label.textContent = t.expect.label;
        const delTest = document.createElement('button');
        delTest.type = 'button';
        delTest.className = 'icon-btn del';
        delTest.title = 'Remove test';
        delTest.appendChild(window.ABIcons.icon('trash', 13));
        delTest.addEventListener('click', () => S.updateNode(node.id, { tests: node.tests.filter((x) => x.id !== t.id) }));
        head.append(label, delTest);
        const input = document.createElement('div');
        input.className = 'test-line';
        input.textContent = `Input: ${t.input}`;
        const crit = document.createElement('div');
        crit.className = 'test-line';
        crit.textContent = `Expect: ${t.expect.text}`;
        item.append(head, input, crit);
        list.appendChild(item);
      }
      body.appendChild(field(`Tests (${node.tests.length}) — offered as criteria when connecting`, list));
    }

    const actions = document.createElement('div');
    actions.className = 'inspector-actions';
    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = 'Delete node';
    del.addEventListener('click', () => S.deleteNode(node.id));
    actions.appendChild(del);
    body.appendChild(actions);
  }

  function renderEdge(edge) {
    if (!edge) return;
    const from = S.node(edge.from);
    const to = S.node(edge.to);
    const h = document.createElement('h3');
    h.textContent = `Connection — ${from?.name} → ${to?.name}`;
    body.appendChild(h);

    const readOnly = (labelText, value, cls) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      const div = document.createElement('div');
      if (cls) div.className = cls;
      div.textContent = value;
      label.appendChild(div);
      return label;
    };
    body.append(
      readOnly('Criteria', edge.criteria?.text || '', 'input criteria-text'),
      readOnly('Pass threshold', `${edge.criteria?.threshold ?? 7}/10`),
      readOnly('On fail', `${edge.criteria?.onFail || 'block'}${edge.criteria?.onFail === 'retry' ? ` (max ${edge.criteria?.retryMax ?? 2})` : ''}`)
    );

    const actions = document.createElement('div');
    actions.className = 'inspector-actions';
    const edit = document.createElement('button');
    edit.className = 'btn';
    edit.textContent = 'Edit criteria';
    edit.addEventListener('click', () => onEditCriteria(edge.id));
    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = 'Delete connection';
    del.addEventListener('click', () => S.deleteEdge(edge.id));
    actions.append(edit, del);
    body.appendChild(actions);
  }

  function renderProject() {
    const p = S.project;
    const h = document.createElement('h3');
    h.textContent = `Project — ${p.name}`;
    body.appendChild(h);

    const name = document.createElement('input');
    name.className = 'input';
    name.value = p.name;
    name.addEventListener('change', () => {
      S.updateProject({ name: name.value.trim() || p.name });
      document.getElementById('project-name').textContent = p.name;
    });
    body.appendChild(field('Name', name));

    const model = modelSelect(p.defaults?.model);
    model.addEventListener('change', () => {
      S.updateProject({ defaults: { ...p.defaults, model: model.value || null } });
    });
    body.appendChild(field('Default model', model));

    const stats = document.createElement('div');
    stats.className = 'empty-hint';
    stats.textContent = `${p.nodes.length} node(s), ${p.edges.length} connection(s). Drag on the canvas to add an agent; drag from a port to connect two.`;
    body.appendChild(stats);
  }

  return { init, setModels };
})();
