const fs = require('fs');
const path = require('path');

const pad = (n) => String(n).padStart(2, '0');

function slug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

function formatRunMarkdown(record) {
  const nodes = record.snapshot?.nodes || [];
  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || id;
  const edgeLabel = (id) => {
    const e = record.snapshot?.edges?.find((x) => x.id === id);
    return e ? `${nodeName(e.from)} → ${nodeName(e.to)}` : id;
  };

  const finals = new Map();
  const gates = [];
  const runErrors = [];
  for (const evt of record.events || []) {
    if (evt.type === 'node-finished' || evt.type === 'node-error' || evt.type === 'node-skipped') finals.set(evt.nodeId, evt);
    else if (evt.type === 'gate-finished') gates.push(evt);
    else if (evt.type === 'run-error') runErrors.push(evt.data.message);
  }

  const lines = [
    '---',
    `project: ${record.projectName}`,
    `runId: ${record.runId}`,
    `status: ${record.status}`,
    `started: ${record.startedAt || ''}`,
    `finished: ${record.finishedAt}`,
    '---',
    '',
    `# ${record.projectName} — ${new Date(record.finishedAt).toLocaleString('en-GB')}`,
    '',
    '## Input',
    '',
    record.input || '_(empty)_',
    ''
  ];

  for (const node of nodes) {
    const evt = finals.get(node.id);
    if (!evt) continue;
    if (evt.type === 'node-finished') lines.push(`## ${node.name}`, '', evt.data.output || '', '');
    else if (evt.type === 'node-error') lines.push(`## ${node.name} (error)`, '', evt.data.message || '', '');
    else lines.push(`## ${node.name} (skipped)`, '', evt.data.reason || '', '');
  }

  if (gates.length) {
    const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
    lines.push('## Gates', '', '| Connection | Outcome | Score | Reason |', '|---|---|---|---|');
    for (const g of gates) {
      const score = g.data.score != null ? `${g.data.score}/${g.data.threshold}` : '—';
      lines.push(`| ${cell(edgeLabel(g.edgeId))} | ${g.data.outcome} | ${score} | ${cell(g.data.reason)} |`);
    }
    lines.push('');
  }

  if (runErrors.length) {
    lines.push('## Run error', '', ...runErrors, '');
  }

  return lines.join('\n');
}

function exportRun(record, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date(record.finishedAt);
  const stamp = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const file = path.join(dir, `${stamp}-${slug(record.projectName)}-${record.status}.md`);
  fs.writeFileSync(file, formatRunMarkdown(record), 'utf-8');
  return file;
}

module.exports = { formatRunMarkdown, exportRun };
