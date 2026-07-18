const { chat } = require('./ollama-client');
const { loadDefinitions, selectDefinitions } = require('./agent-definitions');
const { parseJson } = require('./utils');

const MAX_QUESTIONS = 8;

const INTERVIEW_FORMAT = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['ask', 'done'] },
    question: { type: 'string' }
  },
  required: ['action', 'question']
};

const generationFormat = (models) => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    instructions: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    outputFormat: { type: 'string' },
    suggestedModel: models.length ? { type: 'string', enum: models } : { type: 'string' },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          input: { type: 'string' },
          criteria: { type: 'string' }
        },
        required: ['label', 'input', 'criteria']
      }
    }
  },
  required: ['name', 'role', 'instructions', 'constraints', 'outputFormat', 'suggestedModel', 'tests']
});

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function humaniseName(raw) {
  const words = String(raw).replace(/[_-]+/g, ' ').trim().split(/\s+/);
  return words.map((w) => (w === w.toUpperCase() || w === w.toLowerCase()
    ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    : w)).join(' ');
}

function factsBlock(session) {
  const lines = [`The user's description of the agent:\n"""\n${truncate(session.description, 2000)}\n"""`];
  const answered = session.qa.filter((q) => q.answer !== null);
  if (answered.length) {
    lines.push('\nKnown facts from follow-up questions already asked:');
    for (const q of answered) {
      lines.push(`- Q: ${q.question}\n  A: ${truncate(q.answer, 400)}`);
    }
  }
  return lines.join('\n');
}

function assemblePrompt(g) {
  const bullets = (arr) => arr.filter((s) => s && s.trim()).map((s) => `- ${s.trim()}`);
  const lines = [g.role.trim()];
  const instructions = bullets(g.instructions || []);
  const constraints = bullets(g.constraints || []);
  if (instructions.length) lines.push('', 'Instructions:', ...instructions);
  if (constraints.length) lines.push('', 'Constraints:', ...constraints);
  if (g.outputFormat && g.outputFormat.trim()) lines.push('', `Output format: ${g.outputFormat.trim()}`);
  return lines.join('\n');
}

class AgentInterviewer {
  constructor() {
    this.session = null;
  }

  start(description, opts) {
    this.cancel();
    this.session = {
      description: (typeof description === 'string' ? description : '').trim(),
      qa: [],
      opts,
      abort: null
    };
    return this.nextTurn();
  }

  answer(text) {
    const s = this.session;
    if (!s) return Promise.resolve({ type: 'error', error: 'No interview in progress' });
    const open = s.qa[s.qa.length - 1];
    if (open && open.answer === null) open.answer = (typeof text === 'string' ? text : '').trim() || '(no answer — decide yourself)';
    return this.nextTurn();
  }

  generateNow() {
    if (!this.session) return Promise.resolve({ type: 'error', error: 'No interview in progress' });
    return this.generate();
  }

  cancel() {
    this.session?.abort?.abort();
    this.session = null;
  }

  async callModel(s, messages, format, options, retryHint) {
    s.abort = new AbortController();
    let raw = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      raw = await chat({
        endpoint: s.opts.endpoint,
        model: s.opts.model,
        messages: attempt === 1 ? messages : [...messages, { role: 'assistant', content: raw }, { role: 'user', content: retryHint }],
        format,
        options,
        timeoutMs: s.opts.timeoutMs || 120000,
        signal: s.abort.signal
      });
      const parsed = parseJson(raw);
      if (parsed) return parsed;
    }
    return null;
  }

  async nextTurn() {
    const s = this.session;
    if (s.qa.length >= MAX_QUESTIONS) return this.generate();

    const messages = [
      {
        role: 'system',
        content: `You are helping configure a new AI agent for an agent-orchestration app. Decide whether you have enough information to write the agent's configuration; if not, ask ONE short follow-up question.

A complete spec covers: purpose, inputs it receives, outputs it produces, rules or constraints, tone and style, and scenarios it should be tested against.

Rules:
- Ask about the single most important missing slot only.
- Never ask about anything already covered by the known facts.
- Never repeat a question that already appears in the known facts, even if its answer was vague or off-topic — make a sensible assumption instead.
- Questions must be short, concrete, and answerable in one sentence.
- You have asked ${s.qa.length} of a maximum ${MAX_QUESTIONS} questions. If everything material is known, or the remaining gaps are minor, respond with action "done" and an empty question.

Reply with JSON only: {"action": "ask" | "done", "question": "<the question, or empty if done>"}`
      },
      { role: 'user', content: factsBlock(s) }
    ];

    let parsed;
    try {
      parsed = await this.callModel(s, messages, INTERVIEW_FORMAT, { temperature: 0, seed: 42 },
        'Your previous reply was not valid JSON. Reply with exactly {"action": "ask" | "done", "question": "..."} and nothing else.');
    } catch (err) {
      return this.errorResult(err, s);
    }
    if (this.session !== s) return { type: 'cancelled' };

    if (!parsed || parsed.action !== 'ask' || !parsed.question?.trim()) return this.generate();

    s.qa.push({ question: parsed.question.trim(), answer: null });
    return { type: 'question', question: parsed.question.trim(), index: s.qa.length, max: MAX_QUESTIONS };
  }

  async generate() {
    const s = this.session;
    const answersText = s.qa.filter((q) => q.answer !== null).map((q) => q.answer).join(' ');
    const defs = selectDefinitions(loadDefinitions(s.opts.definitionsDir), `${s.description} ${answersText}`);
    const models = s.opts.models || [];

    const references = defs.length
      ? `Reference agent definitions from the user's library. They show the expected structure, tone, and level of detail — including how testing and test data are specified. Do not copy their sentences; write original content for the new agent.\n\n${defs.map((d) => `<reference_agent name="${d.name}">\n${d.body}\n</reference_agent>`).join('\n\n')}\n\n`
      : '';

    const messages = [
      {
        role: 'system',
        content: 'You write configurations for AI agents that run against local LLMs. You produce a precise, actionable agent spec as JSON matching the requested schema. The name is a short human-readable title (2-4 capitalised words, no underscores). Keep instructions and constraints as short imperative bullet strings (max ~15 words each, 3-6 of each); both describe how the agent must behave when doing its job — never mention testing there. Include 2-4 tests: each has a short label, a realistic example input the agent could receive, and criteria describing what a good output must contain — written so an evaluator can score an output against it.'
      },
      {
        role: 'user',
        content: `${references}${factsBlock(s)}\n\nWrite the configuration for this agent now. Reply with JSON only.`
      }
    ];

    let parsed;
    try {
      parsed = await this.callModel(s, messages, generationFormat(models), { temperature: 0.6 },
        'Your previous reply was not valid JSON matching the schema. Reply with only the JSON object.');
    } catch (err) {
      return this.errorResult(err, s);
    }
    if (this.session !== s) return { type: 'cancelled' };
    if (!parsed || !parsed.name || !parsed.role) {
      return { type: 'error', error: 'The model did not return a usable configuration — try Generate again.', retryable: true };
    }

    const result = {
      name: truncate(humaniseName(parsed.name), 60),
      prompt: assemblePrompt(parsed),
      model: models.includes(parsed.suggestedModel) ? parsed.suggestedModel : null,
      tests: (Array.isArray(parsed.tests) ? parsed.tests : [])
        .filter((t) => t && t.input && t.criteria)
        .map((t, i) => ({
          id: `t-${Date.now().toString(36)}-${i}`,
          input: String(t.input),
          expect: { label: truncate(String(t.label || `Test ${i + 1}`), 60), text: String(t.criteria), threshold: 7 }
        })),
      referencedDefinitions: defs.map((d) => d.name),
      questionsAsked: s.qa.length
    };
    return { type: 'result', result };
  }

  errorResult(err, s) {
    if (err.cancelled || this.session !== s) return { type: 'cancelled' };
    return { type: 'error', error: err.message || String(err), transport: !!err.isTransport, retryable: true };
  }
}

module.exports = { AgentInterviewer, MAX_QUESTIONS, assemblePrompt };
