const fs = require('fs');
const path = require('path');
const os = require('os');
const { ProjectStore } = require('../../lib/project-store');

describe('ProjectStore', () => {
  let tempDir;
  let store;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-projects-'));
    store = new ProjectStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('saves and loads a project', () => {
    const project = { id: 'project-1', name: 'Test', description: 'Desc', createdAt: 'now', updatedAt: 'now', canvas: { nodes: [], edges: [] } };
    store.saveProject(project);

    const loaded = store.loadProject('project-1');
    expect(loaded).toEqual(project);
  });

  test('lists saved projects', () => {
    const project = { id: 'project-2', name: 'List test', description: 'desc', createdAt: 'now', updatedAt: 'now', canvas: { nodes: [], edges: [] } };
    store.saveProject(project);

    const list = store.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'project-2', name: 'List test' });
  });

  test('deletes a project', () => {
    const project = { id: 'project-3', name: 'Delete test', description: 'desc', createdAt: 'now', updatedAt: 'now', canvas: { nodes: [], edges: [] } };
    store.saveProject(project);
    store.deleteProject('project-3');

    expect(store.loadProject('project-3')).toBeNull();
  });

  test('duplicates a project under new id', () => {
    const project = { id: 'project-4', name: 'Original', description: 'desc', createdAt: 'now', updatedAt: 'now', canvas: { nodes: [], edges: [] } };
    store.saveProject(project);

    const duplicateId = store.duplicateProject('project-4', 'Copy');
    const duplicated = store.loadProject(duplicateId);

    expect(duplicated).not.toBeNull();
    expect(duplicated.id).toBe(duplicateId);
    expect(duplicated.name).toBe('Copy');
    expect(duplicated.canvas).toEqual(project.canvas);
  });
});
