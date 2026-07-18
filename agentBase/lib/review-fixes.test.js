jest.mock('./ollama-client');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chat, listModels } = require('./ollama-client');
const { ExecutionEngine } = require('./execution-engine');
const { validateGraph } = require('./graph-validate');
const { ProjectStore } = require('./project-store');
const { AuditStore } = require('./audit-store');

const CONFIG = { endpoint: 'http://localhost:11434', defaultModel: 'test-model', maxSteps: 50, nodeTimeoutMs: 5000 };
const node = (id, role = 'agent') => ({ id, role, name: id, prompt: `You are ${id}` });
const edge = (id, from, to, criteria = {}) => ({
  id, from, to,
  criteria: { label: id, text: 'Output must be good.', threshold: 7, onFail: 'block', ...criteria }
});
const gateReply = (score, reason = 'because') => JSON.stringify({ score, reason });

async function runToEnd(proj, replies) {
  listModels.mockResolvedValue(['test-model']);
  chat.mockImplementation(() => Promise.resolve(replies.shift()));
  const engine = new ExecutionEngine(CONFIG);
  const finished = new Promise((resolve) => engine.on('finished', resolve));
  await engine.run(proj, 'go', CONFIG);
  return finished;
}

beforeEach(() => jest.resetAllMocks());

describe('retry with multiple outgoing edges (stale-verdict race)', () => {
  test('sibling gates are evaluated once, against the post-retry output only', async () => {
    const proj = {
      schema: 'agentbase/project@1', id: 'p1', name: 'T', defaults: { model: null },
      nodes: [node('orch', 'orchestrator'), node('a'), node('b')],
      edges: [edge('e1', 'orch', 'a', { onFail: 'retry', retryMax: 1 }), edge('e2', 'orch', 'b')]
    };
    const record = await runToEnd(proj, [
      'v1', gateReply(2, 'weak'),
      'v2', gateReply(9), gateReply(8),
      'a out', 'b out'
    ]);
    const gates = record.events.filter((e) => e.type === 'gate-finished');
    expect(gates.map((g) => g.data.outcome)).toEqual(['fail-retry', 'pass', 'pass']);
    for (const started of record.events.filter((e) => e.type === 'node-started' && e.nodeId !== 'orch')) {
      expect(started.data.request.messages[1].content).toContain('v2');
      expect(started.data.request.messages[1].content).not.toContain('v1');
    }
  });
});

describe('unreachable node validation', () => {
  test('a node with no path from the orchestrator invalidates the graph', () => {
    const proj = {
      nodes: [node('orch', 'orchestrator'), node('a'), node('island')],
      edges: [edge('e1', 'orch', 'a')]
    };
    const result = validateGraph(proj);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/island.*never run/);
  });
});

describe('path traversal protection', () => {
  let tmp;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-sec-')); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  test('stores reject ids with path separators or dots', () => {
    const projects = new ProjectStore(path.join(tmp, 'projects'));
    expect(() => projects.save({ id: '../evil', name: 'x' })).toThrow(/Invalid id/);
    expect(projects.load('../../etc/passwd')).toBeNull();
    const audit = new AuditStore(tmp);
    expect(() => audit.appendEdits('../evil', [{ summary: 'x' }])).toThrow(/Invalid id/);
    expect(audit.loadRun('..%2F..')).toBeNull();
    expect(() => audit.saveRun({ runId: '../../evil', projectId: 'p1', events: [] })).toThrow(/Invalid id/);
  });

  test('import regenerates malicious project ids', () => {
    const projects = new ProjectStore(path.join(tmp, 'projects'));
    const imported = projects.import({ project: { id: '../evil', name: 'x', nodes: [], edges: [] } });
    expect(imported.id).toMatch(/^[A-Za-z0-9-]+$/);
    expect(imported.id).not.toBe('../evil');
  });
});
