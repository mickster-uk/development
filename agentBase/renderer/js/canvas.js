window.ABCanvas = (() => {
  const NODE_W = 220;
  const NODE_H = 84;
  const S = window.ABState;

  let wrap, layer, svg, nodeLayer, zoomLabel;
  let view = { tx: 40, ty: 40, k: 1 };
  let drag = null;
  let spaceHeld = false;
  let onConnect = null;
  let onCreateNode = null;

  const STATE_ICONS = { running: '◌', passed: '✓', failed: '✕', skipped: '⊘', cancelled: '–' };

  function init(options) {
    wrap = document.getElementById('canvas-wrap');
    layer = document.getElementById('canvas-transform');
    svg = document.getElementById('edge-layer');
    nodeLayer = document.getElementById('node-layer');
    zoomLabel = document.getElementById('zoom-level');
    onConnect = options.onConnect;
    onCreateNode = options.onCreateNode;

    wrap.addEventListener('pointerdown', (e) => onPointerDown(e));
    window.addEventListener('pointermove', (e) => onPointerMove(e));
    window.addEventListener('pointerup', (e) => onPointerUp(e));
    wrap.addEventListener('wheel', (e) => onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) { spaceHeld = true; wrap.classList.add('panning'); e.preventDefault(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceHeld = false; wrap.classList.remove('panning'); } });

    document.getElementById('btn-zoom-in').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
    document.getElementById('btn-zoom-fit').addEventListener('click', () => zoomToFit());

    S.onChange(() => render());
  }

  function applyView() {
    layer.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`;
    wrap.style.backgroundSize = `${24 * view.k}px ${24 * view.k}px`;
    wrap.style.backgroundPosition = `${view.tx}px ${view.ty}px`;
    zoomLabel.textContent = `${Math.round(view.k * 100)}%`;
    if (S.project) S.project.view = { ...view };
  }

  function toWorld(clientX, clientY) {
    const r = wrap.getBoundingClientRect();
    return { x: (clientX - r.left - view.tx) / view.k, y: (clientY - r.top - view.ty) / view.k };
  }

  function zoomBy(factor, cx, cy) {
    const r = wrap.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    const k = Math.min(2.5, Math.max(0.2, view.k * factor));
    view.tx = px - ((px - view.tx) / view.k) * k;
    view.ty = py - ((py - view.ty) / view.k) * k;
    view.k = k;
    applyView();
  }

  function zoomToFit() {
    const nodes = S.project?.nodes || [];
    if (!nodes.length) { view = { tx: 40, ty: 40, k: 1 }; applyView(); return; }
    const minX = Math.min(...nodes.map((n) => n.x)) - 60;
    const minY = Math.min(...nodes.map((n) => n.y)) - 60;
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + 60;
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + 60;
    const r = wrap.getBoundingClientRect();
    const k = Math.min(2.5, Math.max(0.2, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))));
    view = { k, tx: -minX * k + (r.width - (maxX - minX) * k) / 2, ty: -minY * k + (r.height - (maxY - minY) * k) / 2 };
    applyView();
  }

  function onWheel(e) {
    e.preventDefault();
    const r = wrap.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    } else {
      view.tx -= e.deltaX;
      view.ty -= e.deltaY;
      applyView();
    }
  }

  function onPointerDown(e) {
    if (!S.project) return;
    const port = e.target.closest?.('.port.out');
    const nodeEl = e.target.closest?.('.node');
    const edgeHit = e.target.closest?.('path.hit, polygon.gate');

    if (spaceHeld || e.button === 1) {
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
      wrap.setPointerCapture(e.pointerId);
      return;
    }

    if (port && nodeEl) {
      const from = nodeEl.dataset.id;
      drag = { kind: 'link', from };
      markLinkTargets(from);
      const w = toWorld(e.clientX, e.clientY);
      drawDraftEdge(from, w);
      return;
    }

    if (nodeEl) {
      const id = nodeEl.dataset.id;
      const node = S.node(id);
      const w = toWorld(e.clientX, e.clientY);
      drag = { kind: 'node', id, dx: w.x - node.x, dy: w.y - node.y, moved: false };
      if (S.selection.id !== id) S.select('node', id);
      return;
    }

    if (edgeHit) {
      S.select('edge', edgeHit.dataset.id);
      return;
    }

    drag = { kind: 'maybe-create', sx: e.clientX, sy: e.clientY, ghost: null };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (drag.kind === 'pan') {
      view.tx = drag.tx + (e.clientX - drag.sx);
      view.ty = drag.ty + (e.clientY - drag.sy);
      applyView();
    } else if (drag.kind === 'node') {
      const w = toWorld(e.clientX, e.clientY);
      drag.moved = true;
      S.moveNode(drag.id, w.x - drag.dx, w.y - drag.dy, true);
      positionNodeEl(drag.id);
      renderEdges();
    } else if (drag.kind === 'link') {
      const w = toWorld(e.clientX, e.clientY);
      drawDraftEdge(drag.from, w);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node');
      drag.over = over && !over.classList.contains('link-invalid') ? over.dataset.id : null;
    } else if (drag.kind === 'maybe-create') {
      const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (dist >= 8) {
        if (!drag.ghost) {
          drag.ghost = document.createElement('div');
          drag.ghost.className = 'ghost-rect';
          drag.ghost.style.width = `${NODE_W}px`;
          drag.ghost.style.height = `${NODE_H}px`;
          nodeLayer.appendChild(drag.ghost);
        }
        const w = toWorld(e.clientX, e.clientY);
        drag.ghost.style.left = `${w.x - NODE_W / 2}px`;
        drag.ghost.style.top = `${w.y - NODE_H / 2}px`;
        drag.world = w;
      }
    }
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;

    if (d.kind === 'node') {
      if (d.moved) S.moveNode(d.id, S.node(d.id).x, S.node(d.id).y, false);
      return;
    }

    if (d.kind === 'link') {
      clearDraftEdge();
      clearLinkTargets();
      if (d.over) onConnect(d.from, d.over);
      return;
    }

    if (d.kind === 'maybe-create') {
      if (d.ghost) {
        d.ghost.remove();
        onCreateNode(d.world.x - NODE_W / 2, d.world.y - NODE_H / 2, { clientX: e.clientX, clientY: e.clientY });
      } else {
        S.select(null, null);
      }
    }
  }

  function markLinkTargets(from) {
    for (const el of nodeLayer.querySelectorAll('.node')) {
      const to = el.dataset.id;
      const valid = to !== from && !S.hasEdge(from, to) && !S.wouldCreateCycle(from, to);
      el.classList.toggle('link-invalid', !valid);
      if (valid) el.querySelector('.port.in')?.classList.add('valid-target');
    }
  }

  function clearLinkTargets() {
    for (const el of nodeLayer.querySelectorAll('.node')) el.classList.remove('link-invalid');
    for (const p of nodeLayer.querySelectorAll('.valid-target')) p.classList.remove('valid-target');
  }

  function portPos(node, out) {
    return { x: node.x + (out ? NODE_W : 0), y: node.y + NODE_H / 2 };
  }

  function edgePath(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  function drawDraftEdge(fromId, to) {
    clearDraftEdge();
    const from = S.node(fromId);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', edgePath(portPos(from, true), to));
    p.setAttribute('class', 'edge draft');
    p.id = 'draft-edge';
    svg.appendChild(p);
  }

  function clearDraftEdge() {
    document.getElementById('draft-edge')?.remove();
  }

  function positionNodeEl(id) {
    const node = S.node(id);
    const el = nodeLayer.querySelector(`.node[data-id="${id}"]`);
    if (el && node) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
  }

  function renderEdges() {
    const project = S.project;
    svg.innerHTML = '';
    if (!project) return;
    for (const edge of project.edges) {
      const from = S.node(edge.from);
      const to = S.node(edge.to);
      if (!from || !to) continue;
      const a = portPos(from, true);
      const b = portPos(to, false);
      const d = edgePath(a, b);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `edge${S.selection.kind === 'edge' && S.selection.id === edge.id ? ' selected' : ''}`);
      path.dataset.edgeId = edge.id;
      svg.appendChild(path);

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'hit');
      hit.dataset.id = edge.id;
      svg.appendChild(hit);

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const gate = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      gate.setAttribute('points', `${mx},${my - 9} ${mx + 9},${my} ${mx},${my + 9} ${mx - 9},${my}`);
      gate.setAttribute('class', 'gate');
      gate.dataset.id = edge.id;
      gate.dataset.edgeGate = edge.id;
      svg.appendChild(gate);

      if (view.k >= 0.6) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', mx);
        label.setAttribute('y', my + 22);
        label.setAttribute('class', 'gate-label');
        label.textContent = edge.criteria?.label || 'criteria';
        svg.appendChild(label);
      }
    }
  }

  function render() {
    const project = S.project;
    nodeLayer.innerHTML = '';
    if (!project) { svg.innerHTML = ''; return; }
    if (project.view && project.view.k && !drag) {
      view = { ...project.view };
      applyView();
    }

    for (const node of project.nodes) {
      const el = document.createElement('div');
      el.className = `node${S.selection.kind === 'node' && S.selection.id === node.id ? ' selected' : ''}`;
      el.dataset.id = node.id;
      el.dataset.role = node.role;
      el.dataset.state = 'idle';
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;

      const header = document.createElement('div');
      header.className = 'node-header';
      const role = document.createElement('span');
      role.className = 'node-role';
      role.title = node.role;
      role.appendChild(window.ABIcons.icon(node.role === 'orchestrator' ? 'orchestrator' : node.role === 'subagent' ? 'subagent' : 'agent', 13));
      const name = document.createElement('span');
      name.className = 'node-name';
      name.textContent = node.name;
      const icon = document.createElement('span');
      icon.className = 'node-state-icon';
      header.append(role, name, icon);

      const body = document.createElement('div');
      body.className = 'node-body';
      const model = document.createElement('span');
      model.className = 'node-model';
      model.textContent = node.model || 'default model';
      const preview = document.createElement('div');
      preview.className = 'node-preview';
      preview.textContent = node.prompt ? node.prompt : 'No prompt yet — click to edit';
      body.append(model, preview);

      const portIn = document.createElement('span');
      portIn.className = 'port in';
      const portOut = document.createElement('span');
      portOut.className = 'port out';
      portOut.title = 'Drag to connect';

      el.append(header, body, portIn, portOut);
      nodeLayer.appendChild(el);
    }

    renderEdges();
    applyView();
  }

  function setNodeState(nodeId, state, icon) {
    const el = nodeLayer.querySelector(`.node[data-id="${nodeId}"]`);
    if (!el) return;
    el.dataset.state = state;
    el.querySelector('.node-state-icon').textContent = icon ?? STATE_ICONS[state] ?? '';
  }

  function resetRunStates() {
    for (const el of nodeLayer.querySelectorAll('.node')) {
      el.dataset.state = 'pending';
      el.querySelector('.node-state-icon').textContent = '';
    }
    for (const p of svg.querySelectorAll('.edge, .gate')) {
      p.classList.remove('evaluating');
      p.removeAttribute('data-verdict');
    }
  }

  function clearRunStates() {
    for (const el of nodeLayer.querySelectorAll('.node')) el.dataset.state = 'idle';
  }

  function setEdgeVerdict(edgeId, verdict, evaluating) {
    for (const el of svg.querySelectorAll(`[data-edge-id="${edgeId}"], [data-edge-gate="${edgeId}"]`)) {
      el.classList.toggle('evaluating', !!evaluating);
      if (verdict) el.setAttribute('data-verdict', verdict);
    }
    const gate = svg.querySelector(`[data-edge-gate="${edgeId}"]`);
    if (gate && verdict) gate.dataset.verdict = verdict;
  }

  function centerWorld() {
    const r = wrap.getBoundingClientRect();
    const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    return { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 };
  }

  return { init, render, zoomToFit, centerWorld, setNodeState, setEdgeVerdict, resetRunStates, clearRunStates };
})();
