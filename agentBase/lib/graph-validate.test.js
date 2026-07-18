const { validateGraph, wouldCreateCycle } = require('./graph-validate');

const node = (id, role = 'agent') => ({ id, role, name: id });
const edge = (id, from, to) => ({ id, from, to, criteria: { text: 'x', label: 'x' } });

describe('validateGraph', () => {
  test('requires exactly one orchestrator', () => {
    expect(validateGraph({ nodes: [node('a')], edges: [] }).valid).toBe(false);
    expect(validateGraph({ nodes: [node('a', 'orchestrator')], edges: [] }).valid).toBe(true);
    expect(validateGraph({ nodes: [node('a', 'orchestrator'), node('b', 'orchestrator')], edges: [] }).valid).toBe(false);
  });

  test('rejects edges without criteria', () => {
    const project = {
      nodes: [node('a', 'orchestrator'), node('b')],
      edges: [{ id: 'e1', from: 'a', to: 'b' }]
    };
    const result = validateGraph(project);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/criteria/);
  });

  test('rejects self-edges and dangling endpoints', () => {
    const project = {
      nodes: [node('a', 'orchestrator')],
      edges: [edge('e1', 'a', 'a'), edge('e2', 'a', 'ghost')]
    };
    expect(validateGraph(project).errors.length).toBeGreaterThanOrEqual(2);
  });

  test('rejects cycles', () => {
    const project = {
      nodes: [node('a', 'orchestrator'), node('b'), node('c')],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'c', 'b')]
    };
    const result = validateGraph(project);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/cycle/);
  });

  test('handles a project with no nodes or edges without crashing', () => {
    const result = validateGraph({});
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/orchestrator/);
  });

  test('rejects criteria with empty text', () => {
    const project = {
      nodes: [node('a', 'orchestrator'), node('b')],
      edges: [{ id: 'e1', from: 'a', to: 'b', criteria: { label: 'x', text: '' } }]
    };
    const result = validateGraph(project);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/criteria/);
  });

  test('accepts a diamond fan-out and join', () => {
    const project = {
      nodes: [node('a', 'orchestrator'), node('b'), node('c'), node('d')],
      edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'c'), edge('e3', 'b', 'd'), edge('e4', 'c', 'd')]
    };
    expect(validateGraph(project).valid).toBe(true);
  });
});

describe('wouldCreateCycle', () => {
  const nodes = [node('a', 'orchestrator'), node('b'), node('c')];
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')];

  test('detects a back-edge', () => {
    expect(wouldCreateCycle(nodes, edges, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(nodes, edges, 'c', 'b')).toBe(true);
  });

  test('allows forward and sibling edges', () => {
    expect(wouldCreateCycle(nodes, edges, 'a', 'c')).toBe(false);
  });

  test('flags a self-edge probe', () => {
    expect(wouldCreateCycle(nodes, edges, 'b', 'b')).toBe(true);
  });
});
