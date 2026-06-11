'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectBookmarkLinks, buildFolderList, buildBookmarkMarkdown, readDirTree, MARKDOWN_EXT, attemptJsonFix } = require('./utils');

// ── collectBookmarkLinks ──────────────────────────────────────────────────────

describe('collectBookmarkLinks', () => {
  test('collects url nodes', () => {
    const node = { type: 'url', name: 'Google', url: 'https://google.com' };
    const links = [];
    collectBookmarkLinks(node, links);
    expect(links).toEqual([{ title: 'Google', url: 'https://google.com' }]);
  });

  test('uses url as title when name is absent', () => {
    const node = { type: 'url', url: 'https://example.com' };
    const links = [];
    collectBookmarkLinks(node, links);
    expect(links[0].title).toBe('https://example.com');
  });

  test('recurses into folder children', () => {
    const node = {
      type: 'folder',
      children: [
        { type: 'url', name: 'A', url: 'https://a.com' },
        { type: 'url', name: 'B', url: 'https://b.com' },
      ]
    };
    const links = [];
    collectBookmarkLinks(node, links);
    expect(links).toHaveLength(2);
  });

  test('skips nodes with no url', () => {
    const node = { type: 'folder', children: [{ type: 'folder', children: [] }] };
    const links = [];
    collectBookmarkLinks(node, links);
    expect(links).toHaveLength(0);
  });

  test('handles null/undefined gracefully', () => {
    const links = [];
    collectBookmarkLinks(null, links);
    collectBookmarkLinks(undefined, links);
    expect(links).toHaveLength(0);
  });
});

// ── buildFolderList ───────────────────────────────────────────────────────────

describe('buildFolderList', () => {
  test('builds flat map of folders', () => {
    const node = {
      children: [
        { type: 'folder', name: 'Work', children: [] },
        { type: 'folder', name: 'Personal', children: [] },
      ]
    };
    const map = new Map();
    buildFolderList(node, '', map);
    expect(map.size).toBe(2);
    const first = map.get('0');
    expect(first.name).toBe('Work');
  });

  test('builds nested displayPath with separator', () => {
    const node = {
      children: [{
        type: 'folder', name: 'Work', children: [
          { type: 'folder', name: 'Projects', children: [] }
        ]
      }]
    };
    const map = new Map();
    buildFolderList(node, '', map);
    const nested = [...map.values()].find(v => v.name === 'Projects');
    expect(nested.displayPath).toBe('Work › Projects');
  });

  test('skips non-folder, non-children nodes', () => {
    const node = {
      children: [
        { type: 'url', name: 'Link', url: 'https://x.com' }
      ]
    };
    const map = new Map();
    buildFolderList(node, '', map);
    expect(map.size).toBe(0);
  });
});

// ── buildBookmarkMarkdown ─────────────────────────────────────────────────────

describe('buildBookmarkMarkdown', () => {
  test('generates h1 title', () => {
    const md = buildBookmarkMarkdown([], 'My Links');
    expect(md).toContain('# My Links');
  });

  test('includes markdown links', () => {
    const links = [
      { title: 'Google', url: 'https://google.com' },
      { title: 'GitHub', url: 'https://github.com' },
    ];
    const md = buildBookmarkMarkdown(links, 'Bookmarks');
    expect(md).toContain('- [Google](https://google.com)');
    expect(md).toContain('- [GitHub](https://github.com)');
  });

  test('ends with newline', () => {
    const md = buildBookmarkMarkdown([], 'Test');
    expect(md.endsWith('\n')).toBe(true);
  });

  test('returns just title for empty links array', () => {
    const md = buildBookmarkMarkdown([], 'Empty');
    expect(md.trim()).toBe('# Empty');
  });
});

// ── readDirTree ───────────────────────────────────────────────────────────────

describe('readDirTree', () => {
  function makeTmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'knowbase-tree-'));
  }

  test('returns files with correct shape', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes');
    const tree = readDirTree(dir);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ type: 'file', name: 'notes.md' });
    fs.rmSync(dir, { recursive: true });
  });

  test('recurses into subdirectories', () => {
    const dir = makeTmp();
    const sub = path.join(dir, 'sub');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'doc.md'), '# Doc');
    const tree = readDirTree(dir);
    expect(tree[0].type).toBe('directory');
    expect(tree[0].children[0].name).toBe('doc.md');
    fs.rmSync(dir, { recursive: true });
  });

  test('skips dotfiles', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, '.hidden.md'), '# hidden');
    fs.writeFileSync(path.join(dir, 'visible.md'), '# visible');
    const tree = readDirTree(dir);
    expect(tree.map(t => t.name)).not.toContain('.hidden.md');
    fs.rmSync(dir, { recursive: true });
  });

  test('skips node_modules', () => {
    const dir = makeTmp();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'index.md'), '# Index');
    const tree = readDirTree(dir);
    expect(tree.map(t => t.name)).not.toContain('node_modules');
    fs.rmSync(dir, { recursive: true });
  });

  test('filters out non-markdown extensions', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'data.csv'), 'a,b');
    fs.writeFileSync(path.join(dir, 'readme.md'), '# Readme');
    const tree = readDirTree(dir);
    expect(tree.map(t => t.name)).not.toContain('data.csv');
    expect(tree.map(t => t.name)).toContain('readme.md');
    fs.rmSync(dir, { recursive: true });
  });

  test('directories sort before files', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'aaa.md'), '# A');
    fs.mkdirSync(path.join(dir, 'zzz'));
    const tree = readDirTree(dir);
    expect(tree[0].type).toBe('directory');
    expect(tree[1].type).toBe('file');
    fs.rmSync(dir, { recursive: true });
  });

  test('returns empty array for non-existent path', () => {
    expect(readDirTree('/tmp/knowbase-does-not-exist-xyz')).toEqual([]);
  });
});

// ── MARKDOWN_EXT ──────────────────────────────────────────────────────────────

describe('MARKDOWN_EXT', () => {
  test('includes common markdown extensions', () => {
    ['.md', '.markdown', '.txt'].forEach(ext => {
      expect(MARKDOWN_EXT.has(ext)).toBe(true);
    });
  });

  test('includes .json extension', () => {
    expect(MARKDOWN_EXT.has('.json')).toBe(true);
  });

  test('does not include unrelated extensions', () => {
    ['.csv', '.js', '.html', '.png'].forEach(ext => {
      expect(MARKDOWN_EXT.has(ext)).toBe(false);
    });
  });
});

// ── attemptJsonFix ────────────────────────────────────────────────────────────

describe('attemptJsonFix', () => {
  function fix(src) {
    const { result } = attemptJsonFix(src);
    return JSON.parse(result);
  }

  test('converts single-quoted keys and values to double-quoted', () => {
    expect(fix("{'name': 'Alice'}")).toEqual({ name: 'Alice' });
  });

  test('removes trailing commas in objects', () => {
    expect(fix('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  test('removes trailing commas in arrays', () => {
    expect(fix('[1, 2, 3,]')).toEqual([1, 2, 3]);
  });

  test('quotes unquoted keys', () => {
    expect(fix('{name: "Alice"}')).toEqual({ name: 'Alice' });
  });

  test('fixes Python True / False / None', () => {
    expect(fix('{"a": True, "b": False, "c": None}')).toEqual({ a: true, b: false, c: null });
  });

  test('strips single-line // comments', () => {
    expect(fix('{"a": 1 // comment\n}')).toEqual({ a: 1 });
  });

  test('closes unclosed object', () => {
    expect(fix('{"a": 1')).toEqual({ a: 1 });
  });

  test('closes unclosed array', () => {
    expect(fix('[1, 2')).toEqual([1, 2]);
  });

  test('does not corrupt already-valid JSON', () => {
    const valid = JSON.stringify({ x: 1, y: [1, 2, 3], z: true });
    expect(fix(valid)).toEqual({ x: 1, y: [1, 2, 3], z: true });
  });
});
