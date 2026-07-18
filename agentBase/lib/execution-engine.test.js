jest.mock('./ollama-client');
const { chat, listModels } = require('./ollama-client');
const { ExecutionEngine, parseVerdict } = require('./execution-engine');

const CONFIG = { endpoint: 'http://localhost:11434', defaultModel: 'test-model', maxSteps: 50, nodeTimeoutMs: 5000 };

const node = (id, role = 'agent') => ({ id, role, name: id, prompt: `You are ${id}` });
const edge = (id, from, to, criteria = {}) => ({
  id, from, to,
  criteria: { label: id, text: 'Output must be good.', threshold: 7, onFail: 'block', ...criteria }
});

function project(nodes, edges) {
  return { schema: 'agentbase/project@1', id: 'p1', name: 'Test', defaults: { model: null }, nodes, edges };
}

function gateReply(score, reason = 'because') {
  return JSON.stringify({ score, reason });
}

async function runToEnd(proj, replies) {
  listModels.mockResolvedValue(['test-model']);
  chat.mockImplementation(({ format }) => {
    const reply = replies.shift();
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(typeof reply === 'function' ? reply({ isGate: !!format }) : reply);
  });
  const engine = new ExecutionEngine(CONFIG);
  const finished = new Promise((resolve) => engine.on('finished', resolve));
  await engine.run(proj, 'do the thing', CONFIG);
  return finished;
}

const eventsOf = (record, type) => record.events.filter((e) => e.type === type);

beforeEach(() => jest.resetAllMocks());

describe('ExecutionEngine', () => {
  test('linear flow: orchestrator output gated, downstream runs on pass', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a')]
    );
    const record = await runToEnd(proj, ['orch output', gateReply(9), 'a output']);
    expect(record.status).toBe('completed');
    expect(eventsOf(record, 'node-finished').map((e) => e.nodeId)).toEqual(['orch', 'a']);
    expect(eventsOf(record, 'gate-finished')[0].data.outcome).toBe('pass');
  });

  test('failed gate blocks traversal and skips downstream', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a'), node('b')],
      [edge('e1', 'orch', 'a'), edge('e2', 'a', 'b')]
    );
    const record = await runToEnd(proj, ['orch output', gateReply(3)]);
    expect(eventsOf(record, 'gate-finished')[0].data.outcome).toBe('fail');
    const skipped = eventsOf(record, 'node-skipped').map((e) => e.nodeId);
    expect(skipped).toContain('a');
    expect(skipped).toContain('b');
  });

  test('unparseable gate output fails closed with distinct outcome', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a')]
    );
    const record = await runToEnd(proj, ['orch output', 'not json at all', 'still not json']);
    expect(eventsOf(record, 'gate-finished')[0].data.outcome).toBe('unparseable');
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
  });

  test('join waits for all incoming edges and needs at least one pass', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a'), node('b'), node('join')],
      [edge('e1', 'orch', 'a'), edge('e2', 'orch', 'b'), edge('e3', 'a', 'join'), edge('e4', 'b', 'join')]
    );
    const record = await runToEnd(proj, [
      'orch output', gateReply(9), gateReply(9),
      'a output', gateReply(9),
      'b output', gateReply(2),
      'join output'
    ]);
    const joinStart = eventsOf(record, 'node-started').find((e) => e.nodeId === 'join');
    expect(joinStart).toBeTruthy();
    expect(joinStart.data.request.messages[1].content).toContain('## From: a');
    expect(joinStart.data.request.messages[1].content).not.toContain('## From: b');
  });

  test('join with zero passing edges is skipped', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a'), node('join')],
      [edge('e1', 'orch', 'a'), edge('e2', 'a', 'join')]
    );
    const record = await runToEnd(proj, ['orch output', gateReply(9), 'a output', gateReply(1)]);
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('join');
  });

  test('on-fail retry re-runs the source node with feedback', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a', { onFail: 'retry', retryMax: 1 })]
    );
    const record = await runToEnd(proj, [
      'first attempt', gateReply(2, 'too vague'),
      'second attempt', gateReply(9),
      'a output'
    ]);
    const orchStarts = eventsOf(record, 'node-started').filter((e) => e.nodeId === 'orch');
    expect(orchStarts).toHaveLength(2);
    expect(orchStarts[1].data.request.messages[1].content).toContain('too vague');
    expect(eventsOf(record, 'gate-finished').map((e) => e.data.outcome)).toEqual(['fail-retry', 'pass']);
  });

  test('max steps cap terminates the run', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a', { onFail: 'retry', retryMax: 5 })]
    );
    const record = await runToEnd(proj, Array(40).fill(null).flatMap(() => ['output', gateReply(1)]));
    const tightConfig = { ...CONFIG, maxSteps: 4 };
    const engine = new ExecutionEngine(tightConfig);
    listModels.mockResolvedValue(['test-model']);
    let calls = 0;
    chat.mockImplementation(({ format }) => Promise.resolve(format ? gateReply(1) : `output ${++calls}`));
    const finished = new Promise((resolve) => engine.on('finished', resolve));
    await engine.run(proj, 'go', tightConfig);
    const capped = await finished;
    expect(capped.status).toBe('max-steps');
  });

  test('node failure skips downstream but run completes with failures', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a'), node('b')],
      [edge('e1', 'orch', 'a'), edge('e2', 'a', 'b')]
    );
    const record = await runToEnd(proj, ['orch out', gateReply(9), new Error('model exploded')]);
    expect(eventsOf(record, 'node-error').map((e) => e.nodeId)).toContain('a');
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('b');
    expect(record.status).toBe('completed-with-failures');
  });

  test('rejects concurrent runs and invalid graphs', async () => {
    listModels.mockResolvedValue(['test-model']);
    const engine = new ExecutionEngine(CONFIG);
    await expect(engine.run(project([node('a')], []), '', CONFIG)).rejects.toThrow(/orchestrator/);
  });

  test('gate passes when the score equals the threshold and fails one below', async () => {
    const proj = () => project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const exact = await runToEnd(proj(), ['orch out', gateReply(7), 'a out']);
    expect(eventsOf(exact, 'gate-finished')[0].data).toMatchObject({ outcome: 'pass', score: 7, threshold: 7 });
    const below = await runToEnd(proj(), ['orch out', gateReply(6)]);
    expect(eventsOf(below, 'gate-finished')[0].data).toMatchObject({ outcome: 'fail', score: 6, threshold: 7 });
  });

  test('on-fail route runs the fallback node with the failed output', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a'), node('fallback')],
      [edge('e1', 'orch', 'a', { onFail: 'route', routeTo: 'fallback' })]
    );
    const record = await runToEnd(proj, ['orch out', gateReply(2, 'off topic'), 'fallback out']);
    expect(eventsOf(record, 'gate-routed')[0].data.to).toBe('fallback');
    const start = eventsOf(record, 'node-started').find((e) => e.nodeId === 'fallback');
    expect(start.data.request.messages[1].content).toContain('Routed from failed gate');
    expect(start.data.request.messages[1].content).toContain('orch out');
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
    expect(record.status).toBe('completed');
  });

  test('route to a node that is not pending is ignored', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a', { onFail: 'route', routeTo: 'orch' })]
    );
    const record = await runToEnd(proj, ['orch out', gateReply(2)]);
    expect(eventsOf(record, 'gate-routed')).toHaveLength(0);
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
  });

  test('route to a missing node id is ignored', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a', { onFail: 'route', routeTo: 'ghost' })]
    );
    const record = await runToEnd(proj, ['orch out', gateReply(2)]);
    expect(eventsOf(record, 'gate-routed')).toHaveLength(0);
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
  });

  test('retry exhaustion fails the edge after retryMax attempts', async () => {
    const proj = project(
      [node('orch', 'orchestrator'), node('a')],
      [edge('e1', 'orch', 'a', { onFail: 'retry', retryMax: 1 })]
    );
    const record = await runToEnd(proj, ['first', gateReply(2), 'second', gateReply(3)]);
    expect(eventsOf(record, 'gate-finished').map((e) => e.data.outcome)).toEqual(['fail-retry', 'fail']);
    expect(eventsOf(record, 'node-started').filter((e) => e.nodeId === 'orch')).toHaveLength(2);
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
  });

  test('gate reprompts once on invalid JSON and passes on the second attempt', async () => {
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const record = await runToEnd(proj, ['orch out', 'not json', gateReply(8), 'a out']);
    expect(eventsOf(record, 'gate-finished')[0].data.outcome).toBe('pass');
    expect(eventsOf(record, 'node-finished').map((e) => e.nodeId)).toEqual(['orch', 'a']);
  });

  test('gate model error marks the edge as error and skips downstream', async () => {
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const record = await runToEnd(proj, ['orch out', new Error('gate model down')]);
    expect(eventsOf(record, 'gate-finished')[0].data.outcome).toBe('error');
    expect(eventsOf(record, 'node-skipped').map((e) => e.nodeId)).toContain('a');
  });

  test('gate prompt truncates very long outputs', async () => {
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const record = await runToEnd(proj, ['x'.repeat(9000), gateReply(9), 'a out']);
    expect(eventsOf(record, 'gate-finished')[0].data.request[1].content).toContain('[truncated]');
  });

  test('gate evaluation uses the configured gate model', async () => {
    const cfg = { ...CONFIG, gateModel: 'gate-model' };
    listModels.mockResolvedValue(['test-model', 'gate-model']);
    const calls = [];
    chat.mockImplementation((req) => {
      calls.push(req);
      return Promise.resolve(req.format ? gateReply(9) : 'out');
    });
    const engine = new ExecutionEngine(cfg);
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const finished = new Promise((resolve) => engine.on('finished', resolve));
    await engine.run(proj, 'go', cfg);
    await finished;
    expect(calls.find((c) => c.format).model).toBe('gate-model');
    expect(calls.find((c) => !c.format).model).toBe('test-model');
  });

  test('rejects a second run while one is in progress', async () => {
    listModels.mockResolvedValue(['test-model']);
    chat.mockImplementation(({ format }) => new Promise((resolve) => setTimeout(() => resolve(format ? gateReply(9) : 'out'), 0)));
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    const engine = new ExecutionEngine(CONFIG);
    const finished = new Promise((resolve) => engine.on('finished', resolve));
    await engine.run(proj, 'go', CONFIG);
    await expect(engine.run(proj, 'again', CONFIG)).rejects.toThrow(/already in progress/);
    await finished;
  });

  test('rejects the run when the pre-run Ollama check fails', async () => {
    listModels.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const engine = new ExecutionEngine(CONFIG);
    const proj = project([node('orch', 'orchestrator'), node('a')], [edge('e1', 'orch', 'a')]);
    await expect(engine.run(proj, 'go', CONFIG)).rejects.toThrow(/Pre-run check failed/);
  });
});

describe('parseVerdict', () => {
  test('parses clean JSON', () => {
    expect(parseVerdict('{"score": 8, "reason": "solid"}')).toEqual({ score: 8, reason: 'solid' });
  });

  test('extracts JSON from surrounding prose', () => {
    expect(parseVerdict('Here you go: {"score": 3, "reason": "weak"} hope that helps')).toEqual({ score: 3, reason: 'weak' });
  });

  test('tolerates pass/fail booleans', () => {
    expect(parseVerdict('{"pass": true, "reason": "ok"}').score).toBe(10);
    expect(parseVerdict('{"pass": false, "reason": "no"}').score).toBe(1);
  });

  test('rejects garbage and out-of-range scores', () => {
    expect(parseVerdict('nonsense')).toBeNull();
    expect(parseVerdict('{"score": 47, "reason": "x"}')).toBeNull();
    expect(parseVerdict('{"reason": "no score"}')).toBeNull();
  });

  test('accepts boundary scores and rejects just outside the range', () => {
    expect(parseVerdict('{"score": 1, "reason": "x"}').score).toBe(1);
    expect(parseVerdict('{"score": 10, "reason": "x"}').score).toBe(10);
    expect(parseVerdict('{"score": 0, "reason": "x"}')).toBeNull();
    expect(parseVerdict('{"score": 11, "reason": "x"}')).toBeNull();
  });

  test('rounds fractional scores and coerces numeric strings', () => {
    expect(parseVerdict('{"score": 7.6, "reason": "x"}').score).toBe(8);
    expect(parseVerdict('{"score": "8", "reason": "x"}').score).toBe(8);
  });

  test('numeric score wins over a contradictory pass boolean', () => {
    expect(parseVerdict('{"pass": false, "score": 9, "reason": "x"}').score).toBe(9);
  });

  test('clips long reasons and defaults missing reason to empty string', () => {
    expect(parseVerdict(`{"score": 5, "reason": "${'r'.repeat(600)}"}`).reason).toHaveLength(500);
    expect(parseVerdict('{"score": 5}').reason).toBe('');
  });
});
