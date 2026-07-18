const fs = require('fs');
const path = require('path');
const { safeId } = require('./project-store');

class AuditStore {
  constructor(baseDir) {
    this.editsDir = path.join(baseDir, 'audit');
    this.runsDir = path.join(baseDir, 'runs');
    fs.mkdirSync(this.editsDir, { recursive: true });
    fs.mkdirSync(this.runsDir, { recursive: true });
  }

  editsFile(projectId) {
    return path.join(this.editsDir, `${safeId(projectId)}.edits.jsonl`);
  }

  appendEdits(projectId, events) {
    if (!events?.length) return;
    const lines = events.map((e) => JSON.stringify({ ts: new Date().toISOString(), actor: 'user', ...e })).join('\n') + '\n';
    fs.appendFileSync(this.editsFile(projectId), lines, 'utf-8');
  }

  listEdits(projectId, limit = 500) {
    try {
      const lines = fs.readFileSync(this.editsFile(projectId), 'utf-8').trim().split('\n');
      return lines.slice(-limit).reverse().map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  runFile(runId) {
    return path.join(this.runsDir, `${safeId(runId)}.json`);
  }

  saveRun(run) {
    fs.writeFileSync(this.runFile(run.runId), JSON.stringify(run, null, 2), 'utf-8');
  }

  listRuns(projectId) {
    return fs.readdirSync(this.runsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(this.runsDir, f), 'utf-8'));
          return r.projectId === projectId
            ? { runId: r.runId, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status, eventCount: (r.events || []).length }
            : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }

  loadRun(runId) {
    try {
      return JSON.parse(fs.readFileSync(this.runFile(runId), 'utf-8'));
    } catch {
      return null;
    }
  }
}

module.exports = { AuditStore };
