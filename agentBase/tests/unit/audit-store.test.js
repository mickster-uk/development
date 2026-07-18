const fs = require('fs');
const path = require('path');
const os = require('os');
const { AuditStore } = require('../../lib/audit-store');

describe('AuditStore', () => {
  let tempFile;
  let store;

  beforeEach(() => {
    tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-history-')), 'history.json');
    store = new AuditStore(tempFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
  });

  test('records and loads invocation entries', () => {
    const entry = { id: 'run-1', projectId: 'project-a', status: 'completed' };
    store.recordInvocation(entry);
    const all = store.listHistory('project-a');

    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(entry);
  });

  test('loads a specific invocation by id', () => {
    const entry = { id: 'run-2', projectId: 'project-b', status: 'completed' };
    store.recordInvocation(entry);
    const loaded = store.loadInvocation('run-2');

    expect(loaded).toEqual(entry);
  });

  test('clears history', () => {
    store.recordInvocation({ id: 'run-3', projectId: 'project-c', status: 'completed' });
    store.clearHistory();

    expect(store.listHistory()).toHaveLength(0);
  });
});
