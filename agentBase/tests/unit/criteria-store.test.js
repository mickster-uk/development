const fs = require('fs');
const path = require('path');
const os = require('os');
const { CriteriaStore } = require('../../lib/criteria-store');

describe('CriteriaStore', () => {
  let tempFile;
  let store;

  beforeEach(() => {
    tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-criteria-')), 'criteria.json');
    store = new CriteriaStore(tempFile);
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });
  });

  test('saves and lists templates', () => {
    const template = { name: 'Rule 1', description: 'desc', expression: 'true', fields: [] };
    const saved = store.saveTemplate(template);
    expect(saved.id).toBeDefined();

    const templates = store.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ name: 'Rule 1', expression: 'true' });
  });

  test('updates an existing template', () => {
    const template = { name: 'Rule 2', description: 'desc', expression: 'true', fields: [] };
    const saved = store.saveTemplate(template);
    const updated = { ...saved, description: 'updated description' };
    store.saveTemplate(updated);

    const templates = store.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].description).toBe('updated description');
  });

  test('deletes a template', () => {
    const template = { name: 'Rule 3', description: 'desc', expression: 'true', fields: [] };
    const saved = store.saveTemplate(template);
    store.deleteTemplate(saved.id);

    const templates = store.listTemplates();
    expect(templates).toHaveLength(0);
  });
});
