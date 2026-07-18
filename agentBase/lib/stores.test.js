const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProjectStore } = require('./project-store');
const { CriteriaStore } = require('./criteria-store');
const { AuditStore } = require('./audit-store');
const { SEED_TEMPLATES } = require('./criteria-seed');

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ProjectStore', () => {
  test('create, load, list, delete round-trip', () => {
    const store = new ProjectStore(path.join(tmp, 'projects'));
    const p = store.create('My flow');
    expect(store.load(p.id).name).toBe('My flow');
    expect(store.list()).toHaveLength(1);
    store.delete(p.id);
    expect(store.list()).toHaveLength(0);
  });

  test('import regenerates a colliding id and rejects junk', () => {
    const store = new ProjectStore(path.join(tmp, 'projects'));
    const p = store.create('Original');
    const imported = store.import({ project: { ...p } });
    expect(imported.id).not.toBe(p.id);
    expect(() => store.import({ project: { id: 'x' } })).toThrow(/valid/);
  });

  test('export embeds only referenced templates', () => {
    const store = new ProjectStore(path.join(tmp, 'projects'));
    const p = store.create('Flow');
    p.edges = [{ id: 'e1', from: 'a', to: 'b', criteria: { templateId: 'tpl-1', text: 'x' } }];
    store.save(p);
    const templates = [{ id: 'tpl-1', name: 'used' }, { id: 'tpl-2', name: 'unused' }];
    const payload = store.export(p.id, templates);
    expect(payload.templates).toEqual([{ id: 'tpl-1', name: 'used' }]);
  });

  test('export of an unknown project id returns null', () => {
    const store = new ProjectStore(path.join(tmp, 'projects'));
    expect(store.export('missing', [])).toBeNull();
  });

  test('export/import round-trip installs referenced templates in a fresh store', () => {
    const source = new ProjectStore(path.join(tmp, 'src'));
    const sourceCriteria = new CriteriaStore(path.join(tmp, 'src-criteria.json'));
    const custom = sourceCriteria.save({ name: 'Custom', text: 'Must be custom.' });
    const p = source.create('Flow');
    p.nodes = [{ id: 'a', role: 'orchestrator', name: 'a' }, { id: 'b', role: 'agent', name: 'b' }];
    p.edges = [{ id: 'e1', from: 'a', to: 'b', criteria: { templateId: custom.id, text: custom.text } }];
    source.save(p);
    const payload = source.export(p.id, [...sourceCriteria.list().builtin, ...sourceCriteria.list().user]);

    const dest = new ProjectStore(path.join(tmp, 'dst'));
    const destCriteria = new CriteriaStore(path.join(tmp, 'dst-criteria.json'));
    const imported = dest.import(JSON.parse(JSON.stringify(payload)));
    destCriteria.install(payload.templates);

    expect(imported.id).toBe(p.id);
    const loaded = dest.load(imported.id);
    expect(loaded.nodes).toEqual(p.nodes);
    expect(loaded.edges[0].criteria.templateId).toBe(custom.id);
    expect(destCriteria.byId(custom.id).name).toBe('Custom');
    expect(destCriteria.list().user).toHaveLength(1);
  });

  test('list skips unreadable files and sorts newest first', () => {
    const store = new ProjectStore(path.join(tmp, 'projects'));
    const older = store.create('Older');
    const stale = { ...store.load(older.id), updatedAt: '2000-01-01T00:00:00.000Z' };
    fs.writeFileSync(path.join(tmp, 'projects', `${older.id}.json`), JSON.stringify(stale));
    store.create('Newer');
    fs.writeFileSync(path.join(tmp, 'projects', 'junk.json'), 'not json');
    expect(store.list().map((p) => p.name)).toEqual(['Newer', 'Older']);
  });
});

describe('CriteriaStore', () => {
  test('lists seed templates and protects built-ins', () => {
    const store = new CriteriaStore(path.join(tmp, 'criteria.json'));
    expect(store.list().builtin.length).toBe(SEED_TEMPLATES.length);
    expect(() => store.save({ id: SEED_TEMPLATES[0].id, name: 'hack' })).toThrow(/read-only/);
    expect(() => store.delete(SEED_TEMPLATES[0].id)).toThrow(/deleted/);
  });

  test('saves, updates, and deletes user templates', () => {
    const store = new CriteriaStore(path.join(tmp, 'criteria.json'));
    const saved = store.save({ name: 'Mine', text: 'Must be mine.' });
    expect(store.byId(saved.id).name).toBe('Mine');
    store.save({ ...saved, name: 'Renamed' });
    expect(store.list().user).toHaveLength(1);
    expect(store.byId(saved.id).name).toBe('Renamed');
    store.delete(saved.id);
    expect(store.byId(saved.id)).toBeNull();
  });

  test('install skips templates that already exist', () => {
    const store = new CriteriaStore(path.join(tmp, 'criteria.json'));
    store.install([{ id: 'imp-1', name: 'Imported', text: 'x' }, { id: SEED_TEMPLATES[0].id, name: 'dupe' }]);
    expect(store.list().user).toHaveLength(1);
  });
});

describe('AuditStore', () => {
  test('appends and lists edit events newest-first', () => {
    const store = new AuditStore(tmp);
    store.appendEdits('p1', [{ type: 'node-added', subjectId: 'n1', summary: 'first' }]);
    store.appendEdits('p1', [{ type: 'node-updated', subjectId: 'n1', summary: 'second' }]);
    const entries = store.listEdits('p1');
    expect(entries).toHaveLength(2);
    expect(entries[0].summary).toBe('second');
    expect(entries[0].ts).toBeTruthy();
  });

  test('saves and lists runs per project', () => {
    const store = new AuditStore(tmp);
    store.saveRun({ runId: 'r1', projectId: 'p1', startedAt: '2026-07-15T10:00:00Z', status: 'completed', events: [{}, {}] });
    store.saveRun({ runId: 'r2', projectId: 'p2', startedAt: '2026-07-15T11:00:00Z', status: 'failed', events: [] });
    const runs = store.listRuns('p1');
    expect(runs).toHaveLength(1);
    expect(runs[0].eventCount).toBe(2);
    expect(store.loadRun('r1').status).toBe('completed');
    expect(store.loadRun('missing')).toBeNull();
  });

  test('listEdits skips corrupt lines and empty appends are no-ops', () => {
    const store = new AuditStore(tmp);
    store.appendEdits('p1', [{ summary: 'one' }, { summary: 'two' }]);
    fs.appendFileSync(path.join(tmp, 'audit', 'p1.edits.jsonl'), 'garbage\n');
    expect(store.listEdits('p1').map((e) => e.summary)).toEqual(['two', 'one']);
    store.appendEdits('p2', []);
    expect(store.listEdits('p2')).toEqual([]);
  });

  test('listEdits honours the limit keeping newest entries', () => {
    const store = new AuditStore(tmp);
    store.appendEdits('p1', [{ summary: 'one' }, { summary: 'two' }, { summary: 'three' }]);
    expect(store.listEdits('p1', 2).map((e) => e.summary)).toEqual(['three', 'two']);
  });

  test('listRuns skips unreadable run files', () => {
    const store = new AuditStore(tmp);
    store.saveRun({ runId: 'r1', projectId: 'p1', startedAt: '2026-07-15T10:00:00Z', status: 'completed', events: [] });
    fs.writeFileSync(path.join(tmp, 'runs', 'bad.json'), 'nope');
    expect(store.listRuns('p1')).toHaveLength(1);
  });
});
