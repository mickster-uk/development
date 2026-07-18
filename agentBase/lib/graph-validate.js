function validateGraph(project) {
  const errors = [];
  const nodes = project.nodes || [];
  const edges = project.edges || [];
  const ids = new Set(nodes.map((n) => n.id));

  const orchestrators = nodes.filter((n) => n.role === 'orchestrator');
  if (orchestrators.length === 0) errors.push('The graph needs an orchestrator node.');
  if (orchestrators.length > 1) errors.push('Only one orchestrator node is allowed.');

  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Edge ${e.id} has a missing endpoint.`);
    if (e.from === e.to) errors.push(`Edge ${e.id} connects a node to itself.`);
    if (!e.criteria || !e.criteria.text) errors.push(`Edge ${e.id} has no criteria — every connection must have criteria.`);
  }

  if (hasCycle(nodes, edges)) errors.push('The graph contains a cycle — flows must be acyclic (use criteria on-fail "retry" for iteration).');

  if (orchestrators.length === 1) {
    const reachable = new Set([orchestrators[0].id]);
    const stack = [orchestrators[0].id];
    while (stack.length) {
      const id = stack.pop();
      for (const e of edges) {
        if (e.from !== id) continue;
        for (const target of [e.to, e.criteria?.routeTo]) {
          if (target && ids.has(target) && !reachable.has(target)) {
            reachable.add(target);
            stack.push(target);
          }
        }
      }
    }
    for (const n of nodes) {
      if (!reachable.has(n.id)) errors.push(`Node "${n.name || n.id}" is not connected to the orchestrator flow — it would never run.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function hasCycle(nodes, edges) {
  return cycleExists(nodes, edges);
}

function wouldCreateCycle(nodes, edges, from, to) {
  return cycleExists(nodes, [...edges, { id: '__probe', from, to }]);
}

function cycleExists(nodes, edges) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (out.has(e.from)) out.get(e.from).push(e.to);
  }
  const state = new Map();
  const visit = (id) => {
    state.set(id, 'visiting');
    for (const next of out.get(id) || []) {
      const s = state.get(next);
      if (s === 'visiting') return true;
      if (!s && visit(next)) return true;
    }
    state.set(id, 'done');
    return false;
  };
  for (const n of nodes) {
    if (!state.get(n.id) && visit(n.id)) return true;
  }
  return false;
}

module.exports = { validateGraph, wouldCreateCycle };
