const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SitesStore {
  constructor(configPath) {
    this.configPath = configPath;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    } catch {
      return [];
    }
  }

  save(sites) {
    fs.writeFileSync(this.configPath, JSON.stringify(sites, null, 2), 'utf8');
  }

  add({ url, name, maxDepth = 2, maxPages = 50 }) {
    const sites = this.load();
    const site = {
      id: crypto.randomUUID(),
      name: name || new URL(url).hostname,
      url,
      maxDepth,
      maxPages,
      addedAt: new Date().toISOString(),
      lastScrapedAt: null,
      status: 'pending'
    };
    sites.push(site);
    this.save(sites);
    return site;
  }

  remove(id) {
    this.save(this.load().filter(s => s.id !== id));
  }

  update(id, updates) {
    this.save(this.load().map(s => s.id === id ? { ...s, ...updates } : s));
  }

  get(id) {
    return this.load().find(s => s.id === id) || null;
  }

  all() {
    return this.load();
  }
}

module.exports = { SitesStore };
