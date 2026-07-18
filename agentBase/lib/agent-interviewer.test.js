jest.mock('./ollama-client');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chat } = require('./ollama-client');
const { AgentInterviewer, MAX_QUESTIONS } = require('./agent-interviewer');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const NO_DEFS_DIR = path.join(os.tmpdir(), 'agentbase-no-such-definitions-dir');

const raw = (name) => fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
const ASK = raw('ollama-ask-turn.json');
const DONE = raw('ollama-done-turn.json');
const GENERATION = raw('ollama-generation-valid.json');
const UNPARSEABLE = raw('ollama-unparseable.json');
const FALLBACK_MODEL = raw('ollama-fallback-model.json');

const baseOpts = (overrides) => ({
  endpoint: 'http://localhost:11434',
  model: 'test-model',
  timeoutMs: 5000,
  definitionsDir: NO_DEFS_DIR,
  models: [],
  ...overrides
});

let interviewer;
beforeEach(() => {
  jest.resetAllMocks();
  interviewer = new AgentInterviewer();
});
afterEach(() => {
  interviewer.cancel();
});

describe('start()', () => {
  test('returns a question turn when the model wants to ask, with index and max set', async () => {
    chat.mockResolvedValueOnce(ASK);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn).toEqual({
      type: 'question',
      question: 'What are the primary inputs this agent receives, and in what format?',
      index: 1,
      max: MAX_QUESTIONS
    });
  });

  test('runs generation immediately when the model says done on the first turn', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn.type).toBe('result');
  });
});

describe('answer()', () => {
  test('records the answer and advances to the next question', async () => {
    chat.mockResolvedValueOnce(ASK);
    await interviewer.start('a CSV analyst', baseOpts());

    chat.mockResolvedValueOnce(ASK);
    await interviewer.answer('CSV files with OHLCV columns');

    const secondCallMessages = chat.mock.calls[1][0].messages;
    expect(secondCallMessages[1].content).toContain('CSV files with OHLCV columns');
  });

  test('an empty answer is recorded as the decide-yourself placeholder', async () => {
    chat.mockResolvedValueOnce(ASK);
    await interviewer.start('a CSV analyst', baseOpts());

    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    await interviewer.answer('   ');

    const secondCallMessages = chat.mock.calls[1][0].messages;
    expect(secondCallMessages[1].content).toContain('(no answer — decide yourself)');
  });

  test('returns an error when there is no interview in progress', async () => {
    const turn = await interviewer.answer('anything');
    expect(turn).toEqual({ type: 'error', error: 'No interview in progress' });
  });

  test('errors after cancel()', async () => {
    chat.mockResolvedValueOnce(ASK);
    await interviewer.start('a CSV analyst', baseOpts());
    interviewer.cancel();
    const turn = await interviewer.answer('too late');
    expect(turn).toEqual({ type: 'error', error: 'No interview in progress' });
  });
});

describe('generateNow()', () => {
  test('returns an error when there is no interview in progress', async () => {
    const turn = await interviewer.generateNow();
    expect(turn).toEqual({ type: 'error', error: 'No interview in progress' });
  });

  test('generates directly from an in-progress session', async () => {
    chat.mockResolvedValueOnce(ASK);
    await interviewer.start('a CSV analyst', baseOpts());

    chat.mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.generateNow();
    expect(turn.type).toBe('result');
  });
});

describe('generation result shape', () => {
  test('assembles the prompt, humanises the name, maps tests, and nulls an unlisted suggested model', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('a CSV analyst', baseOpts({ models: ['llama3.1:latest'] }));

    expect(turn.type).toBe('result');
    const { result } = turn;
    expect(result.name).toBe('Csv Financial Analyst');
    expect(result.model).toBeNull();
    expect(result.prompt).toContain('Parses CSV financial data and generates markdown summaries');
    expect(result.prompt).toContain('Instructions:');
    expect(result.prompt).toContain('- Read CSV files containing OHLCV data with ticker, date, open, high, low, close, volume columns');
    expect(result.prompt).toContain('Constraints:');
    expect(result.prompt).toContain('- Always validate data format before processing; skip malformed rows with a warning');
    expect(result.prompt).toContain('Output format: Markdown with frontmatter (title, date, tickers), tables of indicators, and interpretation paragraphs');

    expect(result.tests).toHaveLength(3);
    expect(result.tests[0]).toMatchObject({
      input: 'CSV: GBPUSD, dates from 17/07/2025 to 17/07/2026, OHLCV data. Task: analyse trends and moving averages.',
      expect: {
        label: '12-month GBPUSD analysis',
        text: 'Output includes markdown with 20-day and 50-day moving average values, identifies breakouts above 1.3100, contains at least 3 support/resistance levels, all prices in GBP format (£)',
        threshold: 7
      }
    });
    expect(result.tests[0].id).toEqual(expect.any(String));
  });

  test('accepts the suggested model when it is in the installed list', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('a CSV analyst', baseOpts({ models: ['mistral-small'] }));
    expect(turn.result.model).toBe('mistral-small');
  });

  test('nulls a fallback suggested model that is not in the installed list', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(FALLBACK_MODEL);
    const turn = await interviewer.start('a code auditor', baseOpts({ models: ['llama3.1:latest', 'mistral-small'] }));
    expect(turn.result.model).toBeNull();
    expect(turn.result.name).toBe('Code Auditor');
  });

  test('all-caps underscored names are humanised into title case', async () => {
    const custom = JSON.stringify({
      name: 'MY_AGENT_NAME',
      role: 'Does the thing.',
      instructions: ['Do the thing'],
      constraints: ['Never lie'],
      outputFormat: 'Plain text',
      suggestedModel: 'none',
      tests: [{ label: 'Basic', input: 'go', criteria: 'does the thing' }]
    });
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(custom);
    const turn = await interviewer.start('anything', baseOpts());
    expect(turn.result.name).toBe('My Agent Name');
  });

  test('populates referencedDefinitions using the real definitions directory', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('a CSV analyst', baseOpts({ definitionsDir: path.join(FIXTURES_DIR, 'definitions') }));
    expect(turn.result.referencedDefinitions.sort()).toEqual(['test-data', 'tester']);
  });

  test('adds a keyword-matched reference definition when the description overlaps', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('needs code review and correctness auditing', baseOpts({ definitionsDir: path.join(FIXTURES_DIR, 'definitions') }));
    expect(turn.result.referencedDefinitions).toEqual(expect.arrayContaining(['tester', 'test-data', 'reviewer']));
    expect(turn.result.referencedDefinitions).toHaveLength(3);
  });
});

describe('8-question cap', () => {
  test('forces generation on the 9th turn even if the model would still ask', async () => {
    chat.mockResolvedValue(ASK);
    let turn = await interviewer.start('a CSV analyst', baseOpts());
    for (let i = 1; i < MAX_QUESTIONS; i++) {
      expect(turn.type).toBe('question');
      expect(turn.index).toBe(i);
      turn = await interviewer.answer(`answer ${i}`);
    }
    expect(turn.type).toBe('question');
    expect(turn.index).toBe(MAX_QUESTIONS);

    chat.mockReset();
    chat.mockResolvedValueOnce(GENERATION);
    const finalTurn = await interviewer.answer(`answer ${MAX_QUESTIONS}`);
    expect(finalTurn.type).toBe('result');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

describe('unparseable model output', () => {
  test('retries once with a corrective message and succeeds on the second attempt', async () => {
    chat.mockResolvedValueOnce(UNPARSEABLE).mockResolvedValueOnce(ASK);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn.type).toBe('question');
    expect(chat).toHaveBeenCalledTimes(2);
    const retryMessages = chat.mock.calls[1][0].messages;
    expect(retryMessages[retryMessages.length - 1].content).toMatch(/not valid JSON/);
    expect(retryMessages[retryMessages.length - 2].content).toBe(UNPARSEABLE);
  });

  test('two failed interview-turn attempts fall through to generation', async () => {
    chat.mockResolvedValueOnce(UNPARSEABLE).mockResolvedValueOnce(UNPARSEABLE).mockResolvedValueOnce(GENERATION);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn.type).toBe('result');
    expect(chat).toHaveBeenCalledTimes(3);
  });

  test('two failed generation attempts produce a retryable error', async () => {
    chat.mockResolvedValueOnce(DONE).mockResolvedValueOnce(UNPARSEABLE).mockResolvedValueOnce(UNPARSEABLE);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn).toEqual({
      type: 'error',
      error: 'The model did not return a usable configuration — try Generate again.',
      retryable: true
    });
  });
});

describe('transport errors', () => {
  test('a transport error from chat() is surfaced with transport: true', async () => {
    const err = Object.assign(new Error('Cannot reach Ollama — is it running?'), { isTransport: true });
    chat.mockRejectedValueOnce(err);
    const turn = await interviewer.start('a CSV analyst', baseOpts());
    expect(turn).toEqual({
      type: 'error',
      error: 'Cannot reach Ollama — is it running?',
      transport: true,
      retryable: true
    });
  });
});

describe('cancellation mid-call', () => {
  test('cancel() while a chat() call is in flight resolves to a cancelled turn, not a crash', async () => {
    let resolveChat;
    chat.mockImplementationOnce(() => new Promise((resolve) => { resolveChat = resolve; }));
    const startPromise = interviewer.start('a CSV analyst', baseOpts());

    interviewer.cancel();
    resolveChat(ASK);

    await expect(startPromise).resolves.toEqual({ type: 'cancelled' });
  });
});
