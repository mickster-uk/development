const fs = require('fs');
const path = require('path');

const BUDGET_BYTES = 12 * 1024;
const ALWAYS_INCLUDE = ['tester', 'test-data'];

function parseDefinition(file, raw) {
  const name = path.basename(file, '.md');
  const meta = { name, description: '' };
  let body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = raw.slice(fm[0].length);
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
  }
  return { name: meta.name, description: meta.description, body: body.trim(), bytes: Buffer.byteLength(raw) };
}

function loadDefinitions(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  const defs = [];
  for (const file of files) {
    try {
      defs.push(parseDefinition(file, fs.readFileSync(path.join(dir, file), 'utf-8')));
    } catch { }
  }
  return defs;
}

function tokenise(text) {
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []));
}

function overlapScore(queryTokens, def) {
  const defTokens = tokenise(`${def.name} ${def.description}`);
  let score = 0;
  for (const t of defTokens) {
    if (queryTokens.has(t)) score++;
  }
  return score;
}

function selectDefinitions(defs, queryText, budget = BUDGET_BYTES) {
  const queryTokens = tokenise(queryText);
  const always = defs.filter((d) => ALWAYS_INCLUDE.includes(d.name));
  const rest = defs
    .filter((d) => !ALWAYS_INCLUDE.includes(d.name))
    .map((d) => ({ def: d, score: overlapScore(queryTokens, d) }))
    .sort((a, b) => b.score - a.score || a.def.name.localeCompare(b.def.name));

  const selected = [];
  let used = 0;
  for (const d of always) {
    if (used + d.bytes <= budget) {
      selected.push(d);
      used += d.bytes;
    }
  }
  if (rest.length && rest[0].score > 0 && used + rest[0].def.bytes <= budget) {
    selected.push(rest[0].def);
  }
  return selected;
}

module.exports = { loadDefinitions, selectDefinitions, parseDefinition, BUDGET_BYTES };
