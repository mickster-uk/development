window.ABAudit = (() => {
  const S = window.ABState;

  function init() {
    document.getElementById('tab-audit').addEventListener('click', () => refresh());
    document.getElementById('tab-runs').addEventListener('click', () => refresh());
  }

  const fmt = (ts) => new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  async function refresh() {
    if (!S.project) return;
    const [editsRes, runsRes] = await Promise.all([
      window.agentbase.auditEdits(S.project.id),
      window.agentbase.auditRuns(S.project.id)
    ]);
    if (editsRes.success) renderEdits(editsRes.entries);
    if (runsRes.success) {
      renderRuns(runsRes.runs);
      renderRunSidebar(runsRes.runs);
    }
  }

  function renderEdits(entries) {
    const wrap = document.getElementById('audit-table-wrap');
    if (!entries.length) {
      wrap.innerHTML = '<div class="empty-hint">No audit entries yet — every change and run will be recorded here.</div>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const e of entries) {
      const tr = document.createElement('tr');
      for (const val of [fmt(e.ts), e.actor || 'user', e.type, e.summary || '']) {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      }
      tr.children[2].classList.add('mono');
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }

  function renderRuns(runs) {
    const wrap = document.getElementById('runs-table-wrap');
    if (!runs.length) {
      wrap.innerHTML = '<div class="empty-hint">No runs yet.</div>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Started</th><th>Status</th><th>Events</th><th>Run ID</th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const r of runs) {
      const tr = document.createElement('tr');
      tr.className = 'clickable';
      for (const val of [fmt(r.startedAt), r.status, String(r.eventCount), r.runId]) {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      }
      tr.children[3].classList.add('mono');
      tr.addEventListener('click', () => openRun(r.runId));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }

  function renderRunSidebar(runs) {
    const list = document.getElementById('run-list');
    list.innerHTML = '';
    for (const r of runs.slice(0, 12)) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = fmt(r.startedAt);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = r.status;
      li.append(name, meta);
      li.addEventListener('click', () => openRun(r.runId));
      list.appendChild(li);
    }
  }

  async function openRun(runId) {
    const res = await window.agentbase.auditRun(runId);
    if (res.success) window.ABRun.showRun(res.run);
  }

  return { init, refresh };
})();
