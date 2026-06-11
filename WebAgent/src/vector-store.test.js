'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { VectorStore } = require('./vector-store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-vs-'));
}

describe('VectorStore._cosine', () => {
  const vs = new VectorStore(fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cosine-')));

  test('returns ~1 for identical vectors', () => {
    expect(vs._cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  test('returns ~0 for orthogonal vectors', () => {
    expect(vs._cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test('does not divide by zero for zero vector', () => {
    expect(() => vs._cosine([0, 0], [1, 1])).not.toThrow();
  });

  test('returns value in [-1, 1]', () => {
    const score = vs._cosine([0.5, 0.3], [0.1, 0.9]);
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('VectorStore load/save/upsert/removeByUrl', () => {
  test('returns empty array when no file exists', () => {
    const vs = new VectorStore(tmpDir());
    expect(vs.load('site1')).toEqual([]);
  });

  test('save then load round-trips data', () => {
    const vs = new VectorStore(tmpDir());
    const chunks = [{ id: 'a', url: 'https://a.com', content: 'hello' }];
    vs.save('site1', chunks);
    expect(vs.load('site1')).toEqual(chunks);
  });

  test('upsert merges by id', () => {
    const dir = tmpDir();
    const vs = new VectorStore(dir);
    vs.save('site1', [{ id: 'a', content: 'old' }]);
    vs.upsert('site1', [{ id: 'a', content: 'new' }, { id: 'b', content: 'extra' }]);
    const result = vs.load('site1');
    expect(result).toHaveLength(2);
    expect(result.find(c => c.id === 'a').content).toBe('new');
  });

  test('removeByUrl removes matching chunks', () => {
    const vs = new VectorStore(tmpDir());
    vs.save('site1', [
      { id: 'a', url: 'https://a.com', content: 'A' },
      { id: 'b', url: 'https://b.com', content: 'B' },
    ]);
    vs.removeByUrl('site1', 'https://a.com');
    const result = vs.load('site1');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://b.com');
  });
});

describe('VectorStore stats', () => {
  test('returns chunkCount and pageCount', () => {
    const vs = new VectorStore(tmpDir());
    vs.save('site1', [
      { id: 'a', url: 'https://a.com' },
      { id: 'b', url: 'https://a.com' },
      { id: 'c', url: 'https://b.com' },
    ]);
    expect(vs.stats('site1')).toEqual({ chunkCount: 3, pageCount: 2 });
  });

  test('returns zeros for empty store', () => {
    const vs = new VectorStore(tmpDir());
    expect(vs.stats('missing')).toEqual({ chunkCount: 0, pageCount: 0 });
  });
});

describe('VectorStore search', () => {
  test('returns top-k results by cosine score', () => {
    const vs = new VectorStore(tmpDir());
    vs.save('site1', [
      { id: 'a', siteId: 'site1', url: 'https://a.com', title: 'A', section: '', content: 'A', embedding: [1, 0, 0] },
      { id: 'b', siteId: 'site1', url: 'https://b.com', title: 'B', section: '', content: 'B', embedding: [0, 1, 0] },
      { id: 'c', siteId: 'site1', url: 'https://c.com', title: 'C', section: '', content: 'C', embedding: [0, 0, 1] },
    ]);
    const results = vs.search([1, 0, 0], { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('A');
  });

  test('filters by siteIds when provided', () => {
    const dir = tmpDir();
    const vs = new VectorStore(dir);
    vs.save('site1', [{ id: 'a', siteId: 'site1', url: 'u', title: '', section: '', content: 'S1', embedding: [1, 0] }]);
    vs.save('site2', [{ id: 'b', siteId: 'site2', url: 'u', title: '', section: '', content: 'S2', embedding: [1, 0] }]);
    const results = vs.search([1, 0], { siteIds: ['site1'] });
    expect(results.every(r => r.siteId === 'site1')).toBe(true);
  });

  test('skips chunks with no embedding', () => {
    const vs = new VectorStore(tmpDir());
    vs.save('site1', [{ id: 'a', url: 'u', content: 'no embedding' }]);
    expect(vs.search([1, 0])).toHaveLength(0);
  });
});
