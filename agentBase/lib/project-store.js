const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'agentbase/project@1';

function safeId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
    throw new Error('Invalid id');
  }
  return id;
}

class ProjectStore {
  constructor(projectsDir) {
    this.dir = projectsDir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  file(id) {
    return path.join(this.dir, `${safeId(id)}.json`);
  }

  list() {
    return fs.readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf-8'));
          return { id: p.id, name: p.name, updatedAt: p.updatedAt, nodeCount: (p.nodes || []).length };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  create(name) {
    const now = new Date().toISOString();
    const project = {
      schema: SCHEMA,
      id: crypto.randomUUID(),
      name: name || 'Untitled project',
      createdAt: now,
      updatedAt: now,
      defaults: { model: null },
      view: { tx: 0, ty: 0, k: 1 },
      nodes: [],
      edges: []
    };
    this.save(project);
    return project;
  }

  load(id) {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  save(project) {
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.file(project.id), JSON.stringify(project, null, 2), 'utf-8');
    return project;
  }

  delete(id) {
    try { fs.unlinkSync(this.file(id)); } catch { }
  }

  export(id, templates) {
    const project = this.load(id);
    if (!project) return null;
    const templateIds = new Set((project.edges || []).map((e) => e.criteria?.templateId).filter(Boolean));
    return {
      schema: 'agentbase/export@1',
      exportedAt: new Date().toISOString(),
      project,
      templates: (templates || []).filter((t) => templateIds.has(t.id))
    };
  }

  import(payload) {
    const project = payload.project;
    if (!project || !Array.isArray(project.nodes) || !Array.isArray(project.edges)) {
      throw new Error('Not a valid agentBase export file');
    }
    const validId = typeof project.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(project.id);
    if (!validId || this.load(project.id)) project.id = crypto.randomUUID();
    project.schema = SCHEMA;
    project.createdAt = project.createdAt || new Date().toISOString();
    this.save(project);
    return project;
  }
}

module.exports = { ProjectStore, safeId };
