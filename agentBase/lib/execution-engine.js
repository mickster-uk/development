const { EventEmitter } = require('events');
const crypto = require('crypto');
const { chat, listModels } = require('./ollama-client');
const { validateGraph } = require('./graph-validate');

const GATE_FORMAT = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 10 },
    reason: { type: 'string' }
  },
  required: ['score', 'reason']
};

class ExecutionEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.active = null;
  }

  emitEvent(type, data) {
    if (!this.active) return null;
    const evt = {
      runId: this.active.runId,
      seq: ++this.active.seq,
      ts: new Date().toISOString(),
      type,
      ...data
    };
    this.active.events.push(evt);
    this.emit('event', evt);
    return evt;
  }

  async run(project, input, config) {
    if (this.active) throw new Error('A run is already in progress');
    const check = validateGraph(project);
    if (!check.valid) throw new Error(check.errors.join(' '));

    this.config = config;
    try {
      await listModels(config.endpoint);
    } catch (err) {
      throw new Error(`Pre-run check failed: ${err.message}`);
    }

    const runId = `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    this._tokenFlush = new Map();
    this.active = {
      runId,
      project: JSON.parse(JSON.stringify(project)),
      input,
      seq: 0,
      steps: 0,
      events: [],
      nodeState: new Map(),
      nodeOutput: new Map(),
      edgeState: new Map(),
      edgeRetries: new Map(),
      abort: new AbortController(),
      paused: false
    };

    this.execute().catch(() => { });
    return runId;
  }

  cancel() {
    if (!this.active) return;
    this.active.abort.abort();
  }

  buildRunRecord(status) {
    const a = this.active;
    return {
      schema: 'agentbase/run@1',
      runId: a.runId,
      projectId: a.project.id,
      projectName: a.project.name,
      startedAt: a.events[0]?.ts,
      finishedAt: new Date().toISOString(),
      status,
      input: a.input,
      snapshot: a.project,
      events: a.events
    };
  }

  async execute() {
    const a = this.active;
    const { project } = a;
    let status = 'completed';

    this.emitEvent('run-started', { data: { projectId: project.id, input: a.input } });

    for (const n of project.nodes) a.nodeState.set(n.id, 'pending');
    for (const e of project.edges) a.edgeState.set(e.id, 'pending');

    try {
      const orchestrator = project.nodes.find((n) => n.role === 'orchestrator');
      await this.runNode(orchestrator, a.input || 'Begin.');
      await this.drainReady();
      if (a.abort.signal.aborted) status = 'cancelled';
      else if (a.steps > this.maxSteps()) status = 'max-steps';
      else if ([...a.nodeState.values()].includes('failed')) status = 'completed-with-failures';
    } catch (err) {
      status = a.abort.signal.aborted ? 'cancelled' : 'failed';
      this.emitEvent('run-error', { data: { message: err.message } });
    }

    this.emitEvent('run-finished', { data: { status } });
    const record = this.buildRunRecord(status);
    this.active = null;
    this.emit('finished', record);
  }

  maxSteps() {
    return this.config.maxSteps || 50;
  }

  overBudget() {
    this.active.steps += 1;
    return this.active.steps > this.maxSteps();
  }

  async drainReady() {
    const a = this.active;
    let progressed = true;
    while (progressed && !a.abort.signal.aborted) {
      progressed = false;
      for (const node of a.project.nodes) {
        if (a.nodeState.get(node.id) !== 'pending') continue;
        const inEdges = a.project.edges.filter((e) => e.to === node.id);
        if (inEdges.length === 0) continue;
        const states = inEdges.map((e) => a.edgeState.get(e.id));
        if (states.some((s) => s === 'pending')) continue;
        const passed = inEdges.filter((e) => a.edgeState.get(e.id) === 'pass');
        if (passed.length === 0) {
          this.skipNode(node.id, 'no incoming edge passed');
          progressed = true;
          continue;
        }
        const input = passed
          .map((e) => {
            const from = a.project.nodes.find((n) => n.id === e.from);
            return `## From: ${from?.name || e.from}\n${a.nodeOutput.get(e.from) || ''}`;
          })
          .join('\n\n');
        await this.runNode(node, input);
        progressed = true;
      }
    }
  }

  skipNode(nodeId, reason) {
    const a = this.active;
    a.nodeState.set(nodeId, 'skipped');
    this.emitEvent('node-skipped', { nodeId, data: { reason } });
    for (const e of a.project.edges.filter((x) => x.from === nodeId)) {
      if (a.edgeState.get(e.id) === 'pending') {
        a.edgeState.set(e.id, 'skipped');
        this.emitEvent('gate-skipped', { edgeId: e.id, data: { reason: 'upstream skipped' } });
      }
    }
  }

  async runNode(node, input) {
    const a = this.active;
    if (a.abort.signal.aborted) return;
    if (this.overBudget()) {
      this.skipNode(node.id, 'max steps reached');
      return;
    }

    const model = node.model || a.project.defaults?.model || this.config.defaultModel;
    const messages = [
      { role: 'system', content: node.prompt || `You are ${node.name}, an agent in an orchestrated workflow. Do your task directly.` },
      { role: 'user', content: input }
    ];

    a.nodeState.set(node.id, 'running');
    this.emitEvent('node-started', { nodeId: node.id, data: { model, request: { messages } } });

    let output;
    try {
      output = await this.withPauseRetry(() => chat({
        endpoint: this.config.endpoint,
        model,
        messages,
        timeoutMs: node.timeoutMs || this.config.nodeTimeoutMs || 120000,
        signal: a.abort.signal,
        onToken: this.tokenThrottle(node.id)
      }), () => this.emitEvent('node-stream-reset', { nodeId: node.id }));
    } catch (err) {
      this.flushTokens(node.id);
      a.nodeState.set(node.id, a.abort.signal.aborted ? 'cancelled' : 'failed');
      this.emitEvent('node-error', { nodeId: node.id, data: { message: err.message, cancelled: !!a.abort.signal.aborted } });
      for (const e of a.project.edges.filter((x) => x.from === node.id)) {
        a.edgeState.set(e.id, 'skipped');
        this.emitEvent('gate-skipped', { edgeId: e.id, data: { reason: 'source node failed' } });
      }
      return;
    }

    this.flushTokens(node.id);
    a.nodeOutput.set(node.id, output);
    a.nodeState.set(node.id, 'passed');
    this.emitEvent('node-finished', { nodeId: node.id, data: { output } });

    for (const edge of a.project.edges.filter((e) => e.from === node.id)) {
      if (a.abort.signal.aborted) return;
      const result = await this.evaluateGate(edge, node, output);
      if (result?.retried) return;
    }
  }

  tokenThrottle(nodeId) {
    let pending = '';
    let timer = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending) {
        this.emitEvent('node-token', { nodeId, data: { token: pending } });
        pending = '';
      }
    };
    this._tokenFlush.set(nodeId, flush);
    return (token) => {
      pending += token;
      if (!timer) timer = setTimeout(flush, 80);
    };
  }

  flushTokens(nodeId) {
    this._tokenFlush?.get(nodeId)?.();
  }

  async evaluateGate(edge, sourceNode, output) {
    const a = this.active;
    if (this.overBudget()) {
      a.edgeState.set(edge.id, 'skipped');
      this.emitEvent('gate-skipped', { edgeId: edge.id, data: { reason: 'max steps reached' } });
      return;
    }

    const criteria = edge.criteria;
    const threshold = criteria.threshold ?? 7;
    const gateModel = this.config.gateModel || sourceNode.model || a.project.defaults?.model || this.config.defaultModel;

    const messages = [
      {
        role: 'system',
        content: 'You are a strict gate evaluator in an agent workflow. Score how well the OUTPUT satisfies the CRITERION on a 1-10 scale (10 = fully satisfies). Judge only against the criterion. Reply with JSON only: {"score": <1-10>, "reason": "<one sentence>"}.'
      },
      {
        role: 'user',
        content: `CRITERION:\n${criteria.text}\n\nOUTPUT:\n"""\n${truncate(output, 8000)}\n"""`
      }
    ];

    this.emitEvent('gate-started', { edgeId: edge.id, data: { criteria: criteria.label || criteria.text.slice(0, 60), model: gateModel } });

    let verdict = null;
    let raw = '';
    for (let attempt = 1; attempt <= 2 && !verdict; attempt++) {
      try {
        raw = await this.withPauseRetry(() => chat({
          endpoint: this.config.endpoint,
          model: gateModel,
          messages: attempt === 1 ? messages : [...messages, { role: 'assistant', content: raw }, { role: 'user', content: 'Your previous reply was not valid JSON. Reply with exactly {"score": <1-10>, "reason": "<one sentence>"} and nothing else.' }],
          format: GATE_FORMAT,
          options: { temperature: 0, seed: 42 },
          timeoutMs: this.config.nodeTimeoutMs || 120000,
          signal: a.abort.signal
        }));
        verdict = parseVerdict(raw);
      } catch (err) {
        if (a.abort.signal.aborted) return;
        a.edgeState.set(edge.id, 'error');
        this.emitEvent('gate-finished', { edgeId: edge.id, data: { outcome: 'error', reason: err.message, request: messages, raw: null } });
        return;
      }
    }

    if (!verdict) {
      a.edgeState.set(edge.id, 'error');
      this.emitEvent('gate-finished', { edgeId: edge.id, data: { outcome: 'unparseable', reason: 'Gate model did not return valid JSON — edge blocked (fail closed)', request: messages, raw } });
      return;
    }

    const pass = verdict.score >= threshold;
    if (pass) {
      a.edgeState.set(edge.id, 'pass');
      this.emitEvent('gate-finished', { edgeId: edge.id, data: { outcome: 'pass', score: verdict.score, threshold, reason: verdict.reason, request: messages, raw } });
      return;
    }

    const onFail = criteria.onFail || 'block';
    if (onFail === 'retry') {
      const used = a.edgeRetries.get(edge.id) || 0;
      if (used < (criteria.retryMax ?? 2)) {
        a.edgeRetries.set(edge.id, used + 1);
        this.emitEvent('gate-finished', { edgeId: edge.id, data: { outcome: 'fail-retry', score: verdict.score, threshold, reason: verdict.reason, attempt: used + 1, request: messages, raw } });
        a.nodeState.set(sourceNode.id, 'running');
        await this.runNode(sourceNode, `Your previous output did not meet the quality gate:\n${verdict.reason}\n\nRedo the task, addressing that feedback.\n\n${this.lastInputFor(sourceNode)}`);
        return { retried: true };
      }
    }

    a.edgeState.set(edge.id, 'fail');
    this.emitEvent('gate-finished', { edgeId: edge.id, data: { outcome: 'fail', score: verdict.score, threshold, reason: verdict.reason, onFail, request: messages, raw } });

    if (onFail === 'route' && criteria.routeTo) {
      const target = a.project.nodes.find((n) => n.id === criteria.routeTo);
      if (target && a.nodeState.get(target.id) === 'pending') {
        this.emitEvent('gate-routed', { edgeId: edge.id, data: { to: target.id } });
        await this.runNode(target, `## Routed from failed gate "${criteria.label || 'criteria'}" (${verdict.reason})\n\n${output}`);
      }
    }
  }

  lastInputFor(node) {
    const a = this.active;
    if (node.role === 'orchestrator') return a.input || 'Begin.';
    const passed = a.project.edges.filter((e) => e.to === node.id && a.edgeState.get(e.id) === 'pass');
    const sections = passed.map((e) => {
      const from = a.project.nodes.find((n) => n.id === e.from);
      return `## From: ${from?.name || e.from}\n${a.nodeOutput.get(e.from) || ''}`;
    });
    return sections.join('\n\n') || a.input || 'Begin.';
  }

  async withPauseRetry(fn, onRetry) {
    const a = this.active;
    try {
      return await fn();
    } catch (err) {
      if (!err.isTransport || a.abort.signal.aborted) throw err;
      this.emitEvent('run-paused', { data: { reason: err.message } });
      await this.waitForOllama();
      if (a.abort.signal.aborted) throw new Error('Cancelled');
      this.emitEvent('run-resumed', { data: {} });
      onRetry?.();
      return fn();
    }
  }

  waitForOllama() {
    const a = this.active;
    return new Promise((resolve) => {
      const poll = async () => {
        if (a.abort.signal.aborted) return resolve();
        try {
          await listModels(this.config.endpoint);
          resolve();
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 3000);
    });
  }
}

function parseVerdict(raw) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : raw);
    let score = Number(obj.score);
    if (obj.pass === true && !Number.isFinite(score)) score = 10;
    if (obj.pass === false && !Number.isFinite(score)) score = 1;
    if (!Number.isFinite(score) || score < 1 || score > 10) return null;
    return { score: Math.round(score), reason: String(obj.reason || '').slice(0, 500) };
  } catch {
    return null;
  }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + '\n[truncated]' : text;
}

module.exports = { ExecutionEngine, parseVerdict };
