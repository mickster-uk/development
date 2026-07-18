const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatRunMarkdown, exportRun } = require('./run-export');

const pad = (n) => String(n).padStart(2, '0');

function expectedStamp(finishedAt) {
  const d = new Date(finishedAt);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function baseRecord(overrides = {}) {
  return {
    schema: 'agentbase/run@1',
    runId: 'run-1',
    projectId: 'proj-1',
    projectName: 'GBPUSD Analysis',
    startedAt: '2026-07-18T09:00:00.000Z',
    finishedAt: '2026-07-18T09:05:30.000Z',
    status: 'completed',
    input: 'Analyse GBPUSD',
    snapshot: {
      nodes: [
        { id: 'orch', name: 'Orchestrator', role: 'orchestrator' },
        { id: 'analyst', name: 'Analyst', role: 'agent' }
      ],
      edges: [{ id: 'e1', from: 'orch', to: 'analyst' }]
    },
    events: [],
    ...overrides
  };
}

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-runexport-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('formatRunMarkdown', () => {
  test('includes frontmatter fields', () => {
    const record = baseRecord();
    const md = formatRunMarkdown(record);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('project: GBPUSD Analysis');
    expect(md).toContain('runId: run-1');
    expect(md).toContain('status: completed');
    expect(md).toContain('started: 2026-07-18T09:00:00.000Z');
    expect(md).toContain('finished: 2026-07-18T09:05:30.000Z');
  });

  test('renders the input section, falling back to the empty placeholder', () => {
    const withInput = formatRunMarkdown(baseRecord({ input: 'Analyse GBPUSD' }));
    expect(withInput).toContain('## Input\n\nAnalyse GBPUSD');

    const withoutInput = formatRunMarkdown(baseRecord({ input: '' }));
    expect(withoutInput).toContain('## Input\n\n_(empty)_');
  });

  test('a node that finished more than once keeps only the last output', () => {
    const record = baseRecord({
      events: [
        { type: 'node-finished', nodeId: 'analyst', data: { output: 'first attempt output' } },
        { type: 'node-finished', nodeId: 'analyst', data: { output: 'final retried output' } }
      ]
    });
    const md = formatRunMarkdown(record);
    expect(md).toContain('final retried output');
    expect(md).not.toContain('first attempt output');
    expect(md.match(/## Analyst\n/g)).toHaveLength(1);
  });

  test('labels node-error and node-skipped sections', () => {
    const record = baseRecord({
      events: [
        { type: 'node-error', nodeId: 'analyst', data: { message: 'Ollama timed out' } }
      ]
    });
    const errorMd = formatRunMarkdown(record);
    expect(errorMd).toContain('## Analyst (error)');
    expect(errorMd).toContain('Ollama timed out');

    const skippedRecord = baseRecord({
      events: [
        { type: 'node-skipped', nodeId: 'analyst', data: { reason: 'no incoming edge passed' } }
      ]
    });
    const skippedMd = formatRunMarkdown(skippedRecord);
    expect(skippedMd).toContain('## Analyst (skipped)');
    expect(skippedMd).toContain('no incoming edge passed');
  });

  test('omits nodes with no terminal event', () => {
    const record = baseRecord({
      events: [{ type: 'node-finished', nodeId: 'orch', data: { output: 'Begin.' } }]
    });
    const md = formatRunMarkdown(record);
    expect(md).toContain('## Orchestrator');
    expect(md).not.toContain('## Analyst');
  });

  test('sections follow snapshot node order regardless of event order', () => {
    const record = baseRecord({
      snapshot: {
        nodes: [
          { id: 'c', name: 'Node C', role: 'agent' },
          { id: 'a', name: 'Node A', role: 'orchestrator' },
          { id: 'b', name: 'Node B', role: 'agent' }
        ],
        edges: []
      },
      events: [
        { type: 'node-finished', nodeId: 'b', data: { output: 'b output' } },
        { type: 'node-finished', nodeId: 'a', data: { output: 'a output' } },
        { type: 'node-finished', nodeId: 'c', data: { output: 'c output' } }
      ]
    });
    const md = formatRunMarkdown(record);
    const posC = md.indexOf('## Node C');
    const posA = md.indexOf('## Node A');
    const posB = md.indexOf('## Node B');
    expect(posC).toBeGreaterThan(-1);
    expect(posA).toBeGreaterThan(posC);
    expect(posB).toBeGreaterThan(posA);
  });

  test('gate rows escape pipes and flatten newlines in the reason', () => {
    const record = baseRecord({
      events: [
        {
          type: 'gate-finished',
          edgeId: 'e1',
          data: {
            outcome: 'pass',
            score: 8,
            threshold: 7,
            reason: 'Contains | pipe\n   and multiple\nlines of text'
          }
        }
      ]
    });
    const md = formatRunMarkdown(record);
    expect(md).toContain('## Gates');
    expect(md).toContain('| Orchestrator → Analyst | pass | 8/7 | Contains \\| pipe and multiple lines of text |');
  });

  test('a gate with no score shows an em dash', () => {
    const record = baseRecord({
      events: [
        {
          type: 'gate-finished',
          edgeId: 'e1',
          data: { outcome: 'fail', reason: 'no score returned' }
        }
      ]
    });
    const md = formatRunMarkdown(record);
    expect(md).toContain('| Orchestrator → Analyst | fail | — | no score returned |');
  });

  test('no gate events means no Gates section', () => {
    const record = baseRecord({
      events: [{ type: 'node-finished', nodeId: 'analyst', data: { output: 'ok' } }]
    });
    const md = formatRunMarkdown(record);
    expect(md).not.toContain('## Gates');
  });
});

describe('exportRun', () => {
  test('writes into a created, nested, non-existent directory', () => {
    const dir = path.join(tmp, 'a', 'b', 'c');
    expect(fs.existsSync(dir)).toBe(false);
    const record = baseRecord();
    exportRun(record, dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  test('filename follows DD-MM-YYYY-HHmmss-{slug}-{status}.md', () => {
    const record = baseRecord({ projectName: 'My Cool, Project!', status: 'completed-with-failures' });
    const file = exportRun(record, tmp);
    const stamp = expectedStamp(record.finishedAt);
    expect(path.basename(file)).toBe(`${stamp}-my-cool-project-completed-with-failures.md`);
  });

  test('slug lowercases and strips non-alphanumeric characters', () => {
    const record = baseRecord({ projectName: 'ALL-CAPS_Weird///Name!!' });
    const file = exportRun(record, tmp);
    const stamp = expectedStamp(record.finishedAt);
    expect(path.basename(file)).toBe(`${stamp}-all-caps-weird-name-completed.md`);
  });

  test('an empty or emoji-only project name falls back to "untitled"', () => {
    const emptyRecord = baseRecord({ projectName: '' });
    const emptyFile = exportRun(emptyRecord, path.join(tmp, 'empty'));
    const emptyStamp = expectedStamp(emptyRecord.finishedAt);
    expect(path.basename(emptyFile)).toBe(`${emptyStamp}-untitled-completed.md`);

    const emojiRecord = baseRecord({ projectName: '🎉🎉' });
    const emojiFile = exportRun(emojiRecord, path.join(tmp, 'emoji'));
    const emojiStamp = expectedStamp(emojiRecord.finishedAt);
    expect(path.basename(emojiFile)).toBe(`${emojiStamp}-untitled-completed.md`);
  });

  test('returns the written path and its content round-trips through formatRunMarkdown', () => {
    const record = baseRecord({
      events: [{ type: 'node-finished', nodeId: 'analyst', data: { output: 'result text' } }]
    });
    const file = exportRun(record, tmp);
    expect(fs.existsSync(file)).toBe(true);
    const written = fs.readFileSync(file, 'utf-8');
    expect(written).toBe(formatRunMarkdown(record));
  });
});
