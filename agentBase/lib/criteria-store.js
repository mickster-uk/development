const fs = require('fs');
const crypto = require('crypto');
const { SEED_TEMPLATES } = require('./criteria-seed');

class CriteriaStore {
  constructor(userFile) {
    this.userFile = userFile;
  }

  loadUser() {
    try {
      return JSON.parse(fs.readFileSync(this.userFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  saveUser(templates) {
    fs.writeFileSync(this.userFile, JSON.stringify(templates, null, 2), 'utf-8');
  }

  list() {
    return { builtin: SEED_TEMPLATES, user: this.loadUser() };
  }

  byId(id) {
    return SEED_TEMPLATES.find((t) => t.id === id) || this.loadUser().find((t) => t.id === id) || null;
  }

  save(template) {
    if (SEED_TEMPLATES.some((t) => t.id === template.id)) {
      throw new Error('Built-in templates are read-only — duplicate to edit');
    }
    const user = this.loadUser();
    const now = new Date().toISOString();
    const existing = user.findIndex((t) => t.id === template.id);
    const saved = {
      schema: 'agentbase/criteria-template@1',
      id: template.id || crypto.randomUUID(),
      name: template.name || 'Untitled criteria',
      question: template.question || '',
      text: template.text || '',
      threshold: template.threshold ?? 7,
      builtin: false,
      createdAt: existing >= 0 ? user[existing].createdAt : now,
      updatedAt: now
    };
    if (existing >= 0) user[existing] = saved;
    else user.push(saved);
    this.saveUser(user);
    return saved;
  }

  delete(id) {
    if (SEED_TEMPLATES.some((t) => t.id === id)) {
      throw new Error('Built-in templates cannot be deleted');
    }
    this.saveUser(this.loadUser().filter((t) => t.id !== id));
  }

  install(templates) {
    const user = this.loadUser();
    for (const t of templates || []) {
      if (!this.byId(t.id)) user.push({ ...t, builtin: false });
    }
    this.saveUser(user);
  }
}

module.exports = { CriteriaStore };
