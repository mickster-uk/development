window.ABState = (() => {
  let project = null;
  let selection = { kind: null, id: null };
  let dirty = false;
  let edits = [];
  const listeners = new Set();

  const genId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function emit() {
    for (const fn of listeners) fn();
  }

  function recordEdit(type, subjectId, summary) {
    edits.push({ type, subjectId, summary });
    dirty = true;
  }

  return {
    onChange: (fn) => listeners.add(fn),
    get project() { return project; },
    get selection() { return selection; },
    get dirty() { return dirty; },

    setProject(p) {
      project = p;
      selection = { kind: null, id: null };
      dirty = false;
      edits = [];
      emit();
    },

    select(kind, id) {
      selection = { kind, id };
      emit();
    },

    node(id) { return project?.nodes.find((n) => n.id === id); },
    edge(id) { return project?.edges.find((e) => e.id === id); },

    addNode(x, y, preset) {
      const isFirst = project.nodes.length === 0;
      const node = {
        id: genId('n'),
        role: isFirst ? 'orchestrator' : 'agent',
        name: preset?.name || (isFirst ? 'Orchestrator' : `Agent ${project.nodes.length}`),
        prompt: preset?.prompt || '',
        model: preset?.model || null,
        tests: preset?.tests || [],
        timeoutMs: null,
        x: Math.round(x),
        y: Math.round(y)
      };
      project.nodes.push(node);
      recordEdit('node-added', node.id, `"${node.name}" added${preset ? ' (AI-assisted)' : ''}`);
      selection = { kind: 'node', id: node.id };
      emit();
      return node;
    },

    updateProject(patch) {
      if (!project) return;
      const changed = Object.keys(patch).filter((k) => JSON.stringify(project[k]) !== JSON.stringify(patch[k]));
      Object.assign(project, patch);
      if (changed.length) recordEdit('project-updated', project.id, `${changed.join(', ')} changed`);
      emit();
    },

    updateNode(id, patch) {
      const node = this.node(id);
      if (!node) return;
      const changed = Object.keys(patch).filter((k) => node[k] !== patch[k]);
      Object.assign(node, patch);
      if (changed.length) recordEdit('node-updated', id, `"${node.name}": ${changed.join(', ')} changed`);
      emit();
    },

    moveNode(id, x, y, silent) {
      const node = this.node(id);
      if (!node) return;
      node.x = Math.round(x);
      node.y = Math.round(y);
      if (!silent) {
        recordEdit('node-moved', id, `"${node.name}" moved`);
        emit();
      }
    },

    deleteNode(id) {
      const node = this.node(id);
      if (!node) return;
      project.edges = project.edges.filter((e) => {
        if (e.from === id || e.to === id) {
          recordEdit('edge-removed', e.id, 'edge removed with node');
          return false;
        }
        return true;
      });
      project.nodes = project.nodes.filter((n) => n.id !== id);
      recordEdit('node-removed', id, `"${node.name}" removed`);
      if (selection.id === id) selection = { kind: null, id: null };
      emit();
    },

    addEdge(from, to, criteria) {
      const edge = { id: genId('e'), from, to, criteria };
      project.edges.push(edge);
      recordEdit('edge-added', edge.id, `${this.node(from)?.name} → ${this.node(to)?.name}, criteria "${criteria.label}"`);
      emit();
      return edge;
    },

    updateEdgeCriteria(id, criteria) {
      const edge = this.edge(id);
      if (!edge) return;
      edge.criteria = criteria;
      recordEdit('edge-criteria-updated', id, `criteria "${criteria.label}" updated`);
      emit();
    },

    deleteEdge(id) {
      project.edges = project.edges.filter((e) => e.id !== id);
      recordEdit('edge-removed', id, 'edge removed');
      if (selection.id === id) selection = { kind: null, id: null };
      emit();
    },

    wouldCreateCycle(from, to) {
      const out = new Map(project.nodes.map((n) => [n.id, []]));
      for (const e of [...project.edges, { from, to }]) out.get(e.from)?.push(e.to);
      const seen = new Set();
      const stack = [to];
      while (stack.length) {
        const id = stack.pop();
        if (id === from) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(out.get(id) || []));
      }
      return false;
    },

    hasEdge(from, to) {
      return project.edges.some((e) => e.from === from && e.to === to);
    },

    async save() {
      if (!project || !dirty) return;
      const batch = edits;
      edits = [];
      dirty = false;
      const res = await window.agentbase.saveProject(JSON.parse(JSON.stringify(project)), batch);
      if (!res.success) {
        edits = batch.concat(edits);
        dirty = true;
      }
      emit();
    }
  };
})();
