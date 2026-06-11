'use strict';

const fs = require('fs');
const path = require('path');

const MARKDOWN_EXT = new Set([
  '.md', '.markdown', '.mdown', '.mkd', '.mkdn',
  '.mdwn', '.mdtxt', '.mdtext', '.txt', '.json'
]);

function collectBookmarkLinks(node, links) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'url' && node.url) {
    links.push({ title: node.name || node.url, url: node.url });
    return;
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(child => collectBookmarkLinks(child, links));
  }
}

function buildFolderList(node, displayPath, map) {
  if (!Array.isArray(node.children)) return;
  node.children.forEach(child => {
    if (child.type !== 'folder' && !Array.isArray(child.children)) return;
    const childPath = displayPath ? `${displayPath} › ${child.name}` : child.name;
    map.set(String(map.size), { node: child, name: child.name, displayPath: childPath });
    buildFolderList(child, childPath, map);
  });
}

function buildBookmarkMarkdown(links, title) {
  const lines = [`# ${title}`, ''];
  for (const item of links) {
    lines.push(`- [${item.title}](${item.url})`);
  }
  return lines.join('\n') + '\n';
}

function readDirTree(dirPath, depth = 0) {
  if (depth > 6) return [];
  let items;
  try { items = fs.readdirSync(dirPath); } catch (_) { return []; }

  const result = [];
  for (const name of items) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(dirPath, name);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }

    if (stat.isDirectory()) {
      const children = readDirTree(full, depth + 1);
      result.push({ type: 'directory', name, path: full, children });
    } else if (MARKDOWN_EXT.has(path.extname(name).toLowerCase())) {
      result.push({ type: 'file', name, path: full, size: stat.size, modified: stat.mtime.toISOString() });
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return result;
}

function attemptJsonFix(src) {
  let s = src.trim();

  // Strip BOM / zero-width chars
  s = s.replace(/^﻿/, '').replace(/[​-‍﻿]/g, '');

  // Replace smart quotes
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  // Remove single-line // comments
  s = s.replace(/\/\/[^\n]*/g, '');

  // Remove multi-line /* */ comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');

  // Single-quoted strings → double-quoted (handles escaped single quotes inside)
  s = s.replace(/'((?:[^'\\]|\\.)*)'/g, (_, inner) => {
    const unescaped = inner.replace(/\\'/g, "'");
    const escaped   = unescaped.replace(/"/g, '\\"');
    return `"${escaped}"`;
  });

  // Trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');

  // Unquoted keys: word chars before a colon not already quoted
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');

  // Python-style booleans / null
  s = s.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');

  // If content doesn't start with { or [ try wrapping it
  if (!/^[\[{]/.test(s)) {
    const wrapped = `{${s}}`;
    try { JSON.parse(wrapped); return { result: wrapped }; } catch (_) {}
    const wrapped2 = `[${s}]`;
    try { JSON.parse(wrapped2); return { result: wrapped2 }; } catch (_) {}
  }

  // Close unclosed braces / brackets
  const opens = [];
  const pairs = { '{': '}', '[': ']' };
  for (const ch of s) {
    if (ch === '{' || ch === '[') opens.push(pairs[ch]);
    else if (ch === '}' || ch === ']') opens.pop();
  }
  if (opens.length > 0) s = s + opens.reverse().join('');

  return { result: s };
}

module.exports = { collectBookmarkLinks, buildFolderList, buildBookmarkMarkdown, readDirTree, MARKDOWN_EXT, attemptJsonFix };
