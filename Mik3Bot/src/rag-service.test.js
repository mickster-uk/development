'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { RAGService } = require('./rag-service');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mik3bot-rag-'));
}

// ── _chunkMarkdown ────────────────────────────────────────────────────────────

describe('RAGService._chunkMarkdown', () => {
  const rag = new RAGService('/tmp', 'http://localhost:11434');

  test('returns chunks for short sections', () => {
    const md = '# Title\n\nSome content here that is long enough to keep.';
    const chunks = rag._chunkMarkdown(md, 'test.md');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].source).toBe('test.md');
  });

  test('splits oversized sections into multiple chunks', () => {
    // Paragraphs separated by blank lines — chunker should not merge them past CHUNK_MAX
    const para = 'word '.repeat(40).trim(); // ~200 chars each
    const big = '# Big Section\n\n' + [para, para, para, para].join('\n\n');
    const chunks = rag._chunkMarkdown(big, 'big.md');
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('drops chunks below MIN_CHUNK_LEN', () => {
    const md = '# Short\n\nHi.';
    const chunks = rag._chunkMarkdown(md, 'short.md');
    chunks.forEach(c => expect(c.text.length).toBeGreaterThanOrEqual(40));
  });

  test('preserves source on all chunks', () => {
    const md = Array.from({ length: 5 }, (_, i) => `## Section ${i}\n\n` + 'content '.repeat(20)).join('\n\n');
    const chunks = rag._chunkMarkdown(md, 'multi.md');
    chunks.forEach(c => expect(c.source).toBe('multi.md'));
  });
});

// ── _chunkJSON ────────────────────────────────────────────────────────────────

describe('RAGService._chunkJSON', () => {
  const rag = new RAGService('/tmp', 'http://localhost:11434');

  test('chunks a JSON array into one chunk per item', () => {
    const data = JSON.stringify([
      'Item one with enough text to be a valid chunk here',
      'Item two with enough text to be a valid chunk here'
    ]);
    const chunks = rag._chunkJSON(data, 'data.json');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].source).toBe('data.json[0]');
  });

  test('chunks a JSON object into key:value chunks', () => {
    const data = JSON.stringify({ name: 'A long enough value to pass the minimum chunk length filter easily' });
    const chunks = rag._chunkJSON(data, 'obj.json');
    expect(chunks[0].text).toMatch(/^name:/);
    expect(chunks[0].source).toBe('obj.json.name');
  });

  test('falls back gracefully on invalid JSON', () => {
    const chunks = rag._chunkJSON('not valid json but long enough to pass the minimum length check here', 'bad.json');
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });
});

// ── _cosine ───────────────────────────────────────────────────────────────────

describe('RAGService._cosine', () => {
  const rag = new RAGService('/tmp', 'http://localhost:11434');

  test('returns 1 for identical vectors', () => {
    const v = [1, 0, 0];
    expect(rag._cosine(v, v)).toBeCloseTo(1);
  });

  test('returns 0 for orthogonal vectors', () => {
    expect(rag._cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test('returns 0 for zero vector', () => {
    expect(rag._cosine([0, 0], [1, 1])).toBe(0);
  });

  test('returns value between -1 and 1', () => {
    const a = [0.5, 0.3, 0.8];
    const b = [0.1, 0.9, 0.4];
    const score = rag._cosine(a, b);
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ── _findFiles ────────────────────────────────────────────────────────────────

describe('RAGService._findFiles', () => {
  test('finds .md and .json files recursively', () => {
    const dir = makeTmpDir();
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(dir, 'a.md'), '# A');
    fs.writeFileSync(path.join(sub, 'b.json'), '{}');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'ignored');

    const rag = new RAGService(dir, 'http://localhost:11434');
    const files = rag._findFiles();
    const names = files.map(f => path.basename(f));
    expect(names).toContain('a.md');
    expect(names).toContain('b.json');
    expect(names).not.toContain('c.txt');

    fs.rmSync(dir, { recursive: true });
  });

  test('skips dotfiles', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, '.hidden.md'), '# hidden');
    fs.writeFileSync(path.join(dir, 'visible.md'), '# visible');

    const rag = new RAGService(dir, 'http://localhost:11434');
    const files = rag._findFiles();
    expect(files.map(f => path.basename(f))).not.toContain('.hidden.md');
    fs.rmSync(dir, { recursive: true });
  });

  test('returns empty array for non-existent path', () => {
    const rag = new RAGService('/tmp/does-not-exist-mik3bot', 'http://localhost:11434');
    expect(rag._findFiles()).toEqual([]);
  });
});

// ── retrieve ──────────────────────────────────────────────────────────────────

describe('RAGService.retrieve', () => {
  test('returns empty string when not indexed', async () => {
    const rag = new RAGService('/tmp', 'http://localhost:11434');
    const result = await rag.retrieve('anything');
    expect(result).toBe('');
  });

  test('returns matching chunk above similarity threshold', async () => {
    const rag = new RAGService('/tmp', 'http://localhost:11434');
    rag.chunks = [
      { text: 'Node.js is a JavaScript runtime', source: 'nodejs.md', embedding: [1, 0, 0] },
      { text: 'Python is used for data science', source: 'python.md', embedding: [0, 1, 0] },
    ];
    rag.indexed = true;
    rag._embed = jest.fn().mockResolvedValue([1, 0, 0]);
    const result = await rag.retrieve('JavaScript runtime');
    expect(result).toContain('Node.js is a JavaScript runtime');
    expect(result).not.toContain('Python is used');
  });

  test('returns empty string when no chunks score above threshold', async () => {
    const rag = new RAGService('/tmp', 'http://localhost:11434');
    rag.chunks = [{ text: 'Unrelated content about weather', source: 'weather.md', embedding: [0, 0, 1] }];
    rag.indexed = true;
    rag._embed = jest.fn().mockResolvedValue([1, 0, 0]);
    const result = await rag.retrieve('query');
    expect(result).toBe('');
  });
});

// ── getStatus ─────────────────────────────────────────────────────────────────

describe('RAGService.getStatus', () => {
  test('returns not-indexed state initially', () => {
    const rag = new RAGService('/tmp', 'http://localhost:11434');
    const status = rag.getStatus();
    expect(status.indexed).toBe(false);
    expect(status.chunkCount).toBe(0);
    expect(status.lastError).toBeNull();
  });
});
