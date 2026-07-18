(() => {
  const S = window.ABState;
  const C = window.ABCanvas;
  let saveTimer = null;

  async function createNode(x, y, client) {
    const res = await window.agentbase.getConfig();
    const mode = res.success ? res.config.guidedCreate : 'ask';
    if (mode === 'always') window.ABAssist.open({ x, y });
    else if (mode === 'ask' && client) showCreateChooser(x, y, client);
    else S.addNode(x, y);
  }

  function showCreateChooser(x, y, client) {
    document.getElementById('create-chooser')?.remove();
    const wrap = document.getElementById('canvas-wrap');
    const r = wrap.getBoundingClientRect();
    const chooser = document.createElement('div');
    chooser.id = 'create-chooser';
    chooser.style.left = `${Math.min(client.clientX - r.left, r.width - 150)}px`;
    chooser.style.top = `${Math.min(client.clientY - r.top, r.height - 80)}px`;

    const blank = document.createElement('button');
    blank.className = 'btn';
    blank.append(window.ABIcons.icon('plus', 14), document.createTextNode('Blank agent'));
    blank.addEventListener('click', () => { chooser.remove(); S.addNode(x, y); });

    const ai = document.createElement('button');
    ai.className = 'btn btn-ai';
    ai.append(window.ABIcons.icon('sparkles', 14), document.createTextNode('AI-assist'));
    ai.addEventListener('click', () => { chooser.remove(); window.ABAssist.open({ x, y }); });

    chooser.append(blank, ai);
    wrap.appendChild(chooser);
    blank.focus();

    const dismiss = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'pointerdown' && chooser.contains(e.target)) return;
      chooser.remove();
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', dismiss, true);
    };
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', dismiss, true);
  }

  async function connectNodes(from, to) {
    const criteria = await window.ABDialogs.requestCriteria(from, to);
    if (criteria) S.addEdge(from, to, criteria);
    document.getElementById('canvas-wrap').focus();
  }

  async function editCriteria(edgeId) {
    const criteria = await window.ABDialogs.editCriteria(edgeId);
    if (criteria) S.updateEdgeCriteria(edgeId, criteria);
  }

  function scheduleSave() {
    if (!S.dirty) return;
    document.getElementById('dirty-dot').hidden = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await S.save();
      document.getElementById('dirty-dot').hidden = !S.dirty;
    }, 800);
  }

  async function refreshProjects() {
    const res = await window.agentbase.listProjects();
    if (!res.success) return;
    const list = document.getElementById('project-list');
    list.innerHTML = '';
    for (const p of res.projects) {
      const li = document.createElement('li');
      li.classList.toggle('active', S.project?.id === p.id);
      const name = document.createElement('span');
      name.textContent = p.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${p.nodeCount}n`;
      const del = document.createElement('button');
      del.className = 'icon-btn del';
      del.textContent = '×';
      del.title = 'Delete project';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.agentbase.deleteProject(p.id);
        if (S.project?.id === p.id) S.setProject(null);
        refreshProjects();
      });
      li.append(name, meta, del);
      li.addEventListener('click', () => openProject(p.id));
      list.appendChild(li);
    }
  }

  async function openProject(id) {
    const res = await window.agentbase.loadProject(id);
    if (!res.success) return;
    S.setProject(res.project);
    document.getElementById('project-name').textContent = res.project.name;
    refreshProjects();
    window.ABAudit.refresh();
  }

  async function newProject() {
    const res = await window.agentbase.createProject(`Project ${new Date().toLocaleDateString('en-GB')}`);
    if (!res.success) return;
    S.setProject(res.project);
    document.getElementById('project-name').textContent = res.project.name;
    refreshProjects();
  }

  function toggleClass(id, cls) {
    document.getElementById('app').classList.toggle(cls);
  }

  function bindTopbar() {
    document.getElementById('btn-new-project').addEventListener('click', () => newProject());
    document.getElementById('btn-add-agent').addEventListener('click', () => {
      if (!S.project) return;
      const c = C.centerWorld();
      createNode(c.x, c.y, null);
    });
    document.getElementById('btn-add-ai').addEventListener('click', () => {
      if (!S.project) return;
      window.ABAssist.open(C.centerWorld());
    });
    document.getElementById('btn-sidebar').addEventListener('click', () => toggleClass('app', 'sidebar-collapsed'));
    document.getElementById('btn-inspector').addEventListener('click', () => toggleClass('app', 'inspector-collapsed'));
    document.getElementById('btn-drawer').addEventListener('click', () => toggleClass('app', 'drawer-collapsed'));

    document.getElementById('btn-theme').addEventListener('click', async () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      await window.agentbase.setConfig({ theme: next });
    });

    document.getElementById('btn-export').addEventListener('click', async () => {
      if (S.project) await window.agentbase.exportProject(S.project.id);
    });
    document.getElementById('btn-import').addEventListener('click', async () => {
      const res = await window.agentbase.importProject();
      if (res.success && res.project) {
        S.setProject(res.project);
        document.getElementById('project-name').textContent = res.project.name;
        refreshProjects();
      }
    });

    for (const tab of document.querySelectorAll('.drawer-tabs .tab')) {
      tab.addEventListener('click', () => window.ABRun.activateTab(tab.dataset.panel));
    }
  }

  function bindResizer() {
    const resizer = document.getElementById('drawer-resizer');
    let startY = 0;
    let startH = 0;
    resizer.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      startH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--drawer-h'));
      resizer.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const h = Math.min(520, Math.max(120, startH + (startY - ev.clientY)));
        document.documentElement.style.setProperty('--drawer-h', `${h}px`);
      };
      const up = () => {
        resizer.removeEventListener('pointermove', move);
        resizer.removeEventListener('pointerup', up);
      };
      resizer.addEventListener('pointermove', move);
      resizer.addEventListener('pointerup', up);
    });
    resizer.addEventListener('keydown', (e) => {
      const h = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--drawer-h'));
      if (e.key === 'ArrowUp') document.documentElement.style.setProperty('--drawer-h', `${Math.min(520, h + 16)}px`);
      if (e.key === 'ArrowDown') document.documentElement.style.setProperty('--drawer-h', `${Math.max(120, h - 16)}px`);
    });
  }

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'r') { e.preventDefault(); document.getElementById('btn-run').click(); }
      else if (mod && e.key === 'b') { e.preventDefault(); toggleClass('app', 'sidebar-collapsed'); }
      else if (mod && e.key === 'i') { e.preventDefault(); toggleClass('app', 'inspector-collapsed'); }
      else if (mod && e.key === 'j') { e.preventDefault(); toggleClass('app', 'drawer-collapsed'); }
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); document.getElementById('btn-zoom-in').click(); }
      else if (mod && e.key === '-') { e.preventDefault(); document.getElementById('btn-zoom-out').click(); }
      else if (e.shiftKey && e.key === '!') { if (!inField) C.zoomToFit(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        const { kind, id } = S.selection;
        if (kind === 'node') S.deleteNode(id);
        else if (kind === 'edge') S.deleteEdge(id);
      } else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
        S.select(null, null);
      }
    });
  }

  async function boot() {
    window.ABIcons.mount();
    document.getElementById('btn-add-agent').prepend(window.ABIcons.icon('plus', 14));
    document.getElementById('btn-add-ai').prepend(window.ABIcons.icon('sparkles', 14));
    document.getElementById('btn-import').prepend(window.ABIcons.icon('import', 14));
    document.getElementById('btn-export').prepend(window.ABIcons.icon('export', 14));
    C.init({ onConnect: (from, to) => connectNodes(from, to), onCreateNode: (x, y, client) => createNode(x, y, client) });
    window.ABInspector.init({ onEditCriteria: (edgeId) => editCriteria(edgeId) });
    window.ABDialogs.init();
    window.ABAssist.init();
    window.ABRun.init();
    window.ABAudit.init();
    bindTopbar();
    bindResizer();
    bindKeyboard();

    S.onChange(() => scheduleSave());

    const cfgRes = await window.agentbase.getConfig();
    const cfg = cfgRes.success ? cfgRes.config : {};
    if (cfg.theme === 'light') document.documentElement.dataset.theme = 'light';
    window.ABRun.setFormatting(cfg);

    const verRes = await window.agentbase.getVersion();
    if (verRes.success) document.getElementById('version-badge').textContent = `v${verRes.version}`;

    const modelsRes = await window.agentbase.listModels();
    if (modelsRes.success) {
      window.ABInspector.setModels(modelsRes.models);
      window.ABAssist.setModels(modelsRes.models);
    }

    await window.ABDialogs.refreshTemplates();
    await refreshProjects();
    if (cfg.lastProjectId) {
      const res = await window.agentbase.loadProject(cfg.lastProjectId);
      if (res.success) {
        S.setProject(res.project);
        document.getElementById('project-name').textContent = res.project.name;
        refreshProjects();
        window.ABAudit.refresh();
      }
    }
  }

  boot();
})();
