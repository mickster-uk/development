const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseDefinition, loadDefinitions, selectDefinitions, BUDGET_BYTES } = require('./agent-definitions');
const { ProjectStore } = require('./project-store');

const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'definitions');
const SAMPLE_PROJECT_FILE = path.join(__dirname, '..', 'tests', 'fixtures', 'sample-project.json');

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-defs-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('parseDefinition', () => {
  test('parses frontmatter meta and strips it from the body', () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, 'reviewer.md'), 'utf-8');
    const def = parseDefinition('reviewer.md', raw);
    expect(def.name).toBe('reviewer');
    expect(def.description).toMatch(/Audits code changes/);
    expect(def.body).not.toMatch(/^---/);
    expect(def.body).toMatch(/You are the code reviewer/);
    expect(def.bytes).toBe(Buffer.byteLength(raw));
  });

  test('falls back to filename and empty description when there is no frontmatter', () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, 'nofrontmatter.md'), 'utf-8');
    const def = parseDefinition('nofrontmatter.md', raw);
    expect(def.name).toBe('nofrontmatter');
    expect(def.description).toBe('');
    expect(def.body).toBe(raw.trim());
  });
});

describe('loadDefinitions', () => {
  test('returns [] for a missing directory', () => {
    expect(loadDefinitions(path.join(tmp, 'does-not-exist'))).toEqual([]);
  });

  test('loads every definition from a real fixtures directory', () => {
    const defs = loadDefinitions(FIXTURES_DIR);
    expect(defs.map((d) => d.name).sort()).toEqual([
      'nofrontmatter', 'performance-analyst', 'reviewer', 'test-data', 'tester', 'writer'
    ]);
  });

  test('skips files it cannot read but still returns the rest', () => {
    fs.writeFileSync(path.join(tmp, 'good.md'), '---\nname: good\ndescription: fine\n---\nbody');
    const lockedPath = path.join(tmp, 'locked.md');
    fs.writeFileSync(lockedPath, '---\nname: locked\ndescription: hidden\n---\nbody');
    fs.chmodSync(lockedPath, 0o000);
    try {
      const defs = loadDefinitions(tmp);
      expect(defs.map((d) => d.name)).toEqual(['good']);
    } finally {
      fs.chmodSync(lockedPath, 0o644);
    }
  });
});

describe('selectDefinitions', () => {
  const def = (name, description, bytes) => ({ name, description, body: `${name} body`, bytes });

  test('always includes tester and test-data when they fit, with no keyword match', () => {
    const defs = [
      def('tester', 'runs test suites', 100),
      def('test-data', 'produces fixtures', 100),
      def('writer', 'writes documentation', 100)
    ];
    const selected = selectDefinitions(defs, 'completely unrelated query text');
    expect(selected.map((d) => d.name)).toEqual(['tester', 'test-data']);
  });

  test('adds the best keyword-overlap match only when its score is above zero', () => {
    const defs = [
      def('tester', 'runs test suites', 100),
      def('test-data', 'produces fixtures', 100),
      def('reviewer', 'code review performance audits', 100),
      def('writer', 'writes documentation guides', 100)
    ];
    const selected = selectDefinitions(defs, 'I need help with code review performance');
    expect(selected.map((d) => d.name)).toEqual(['tester', 'test-data', 'reviewer']);
  });

  test('breaks score ties by ascending definition name', () => {
    const defs = [
      def('tester', 'runs test suites', 100),
      def('test-data', 'produces fixtures', 100),
      def('banana', 'shared keyword token', 100),
      def('apple', 'shared keyword token', 100)
    ];
    const selected = selectDefinitions(defs, 'shared keyword token');
    expect(selected.map((d) => d.name)).toEqual(['tester', 'test-data', 'apple']);
  });

  test('respects the byte budget, dropping always-includes that do not fit', () => {
    const defs = [
      def('tester', 'runs test suites', 500),
      def('test-data', 'produces fixtures', 500),
      def('reviewer', 'shared keyword token', 500)
    ];
    const selected = selectDefinitions(defs, 'shared keyword token', 700);
    expect(selected.map((d) => d.name)).toEqual(['tester']);
  });

  test('drops the best-match extra when it would exceed the remaining budget', () => {
    const defs = [
      def('tester', 'runs test suites', 400),
      def('test-data', 'produces fixtures', 400),
      def('reviewer', 'shared keyword token', 400)
    ];
    const selected = selectDefinitions(defs, 'shared keyword token', 800);
    expect(selected.map((d) => d.name)).toEqual(['tester', 'test-data']);
  });

  test('is deterministic across repeated calls with the same input', () => {
    const defs = [
      def('tester', 'runs test suites', 100),
      def('test-data', 'produces fixtures', 100),
      def('reviewer', 'code review', 100),
      def('writer', 'code review', 100)
    ];
    const first = selectDefinitions(defs, 'code review').map((d) => d.name);
    const second = selectDefinitions(defs, 'code review').map((d) => d.name);
    expect(first).toEqual(second);
    expect(first).toEqual(['tester', 'test-data', 'reviewer']);
  });

  test('with real fixtures, a large definition is excluded when the budget is tight', () => {
    const defs = loadDefinitions(FIXTURES_DIR);
    const testerBytes = defs.find((d) => d.name === 'tester').bytes;
    const testDataBytes = defs.find((d) => d.name === 'test-data').bytes;
    const tightBudget = testerBytes + testDataBytes + 100;
    const selected = selectDefinitions(defs, 'profile runtime performance under load', tightBudget);
    expect(selected.map((d) => d.name).sort()).toEqual(['test-data', 'tester']);
  });

  test('with real fixtures and the default budget, performance-analyst wins on keyword overlap', () => {
    const defs = loadDefinitions(FIXTURES_DIR);
    const selected = selectDefinitions(defs, 'profiles runtime performance memory usage system load workloads', BUDGET_BYTES);
    expect(selected.map((d) => d.name)).toEqual(expect.arrayContaining(['tester', 'test-data']));
    expect(selected.map((d) => d.name)).toContain('performance-analyst');
    expect(selected).toHaveLength(3);
  });
});

describe('ProjectStore round-trips node.tests', () => {
  test('a project with test cases on a node survives save/load intact', () => {
    const project = JSON.parse(fs.readFileSync(SAMPLE_PROJECT_FILE, 'utf-8'));
    const store = new ProjectStore(path.join(tmp, 'projects'));
    store.save(project);

    const loaded = store.load(project.id);
    const analyst = loaded.nodes.find((n) => n.id === 'n-analyst-1');
    expect(analyst.tests).toEqual(project.nodes.find((n) => n.id === 'n-analyst-1').tests);
    expect(analyst.tests).toHaveLength(3);
    expect(analyst.tests[0]).toEqual({
      id: 't-b2k1c9a-0',
      input: 'CSV: GBPUSD, dates from 17/07/2025 to 17/07/2026, OHLCV data. Task: analyse trends and moving averages.',
      expect: {
        label: '12-month GBPUSD analysis',
        text: 'Output includes markdown with 20-day and 50-day moving average values, identifies breakouts above 1.3100, contains at least 3 support/resistance levels, all prices in GBP format (£)',
        threshold: 7
      }
    });
    const orchestrator = loaded.nodes.find((n) => n.id === 'n-orchestrator-1');
    expect(orchestrator.tests).toEqual([]);
  });
});
