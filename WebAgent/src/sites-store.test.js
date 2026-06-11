'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SitesStore } = require('./sites-store');

function tmpConfig() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-ss-')), 'sites.json');
}

describe('SitesStore', () => {
  test('returns empty array when no file exists', () => {
    const store = new SitesStore(tmpConfig());
    expect(store.all()).toEqual([]);
  });

  test('add creates a site with auto-generated id', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com', name: 'Example' });
    expect(site.id).toBeDefined();
    expect(site.url).toBe('https://example.com');
    expect(site.name).toBe('Example');
    expect(site.status).toBe('pending');
  });

  test('add uses hostname when name is not provided', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com' });
    expect(site.name).toBe('example.com');
  });

  test('add defaults maxDepth and maxPages', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com' });
    expect(site.maxDepth).toBe(2);
    expect(site.maxPages).toBe(50);
  });

  test('get returns site by id', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com' });
    expect(store.get(site.id)).toMatchObject({ url: 'https://example.com' });
  });

  test('get returns null for unknown id', () => {
    const store = new SitesStore(tmpConfig());
    expect(store.get('unknown-id')).toBeNull();
  });

  test('remove deletes site by id', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com' });
    store.remove(site.id);
    expect(store.all()).toHaveLength(0);
  });

  test('update merges fields', () => {
    const store = new SitesStore(tmpConfig());
    const site = store.add({ url: 'https://example.com' });
    store.update(site.id, { status: 'done', lastScrapedAt: '2025-01-01T00:00:00Z' });
    const updated = store.get(site.id);
    expect(updated.status).toBe('done');
    expect(updated.lastScrapedAt).toBe('2025-01-01T00:00:00Z');
    expect(updated.url).toBe('https://example.com');
  });

  test('all returns multiple sites', () => {
    const store = new SitesStore(tmpConfig());
    store.add({ url: 'https://a.com' });
    store.add({ url: 'https://b.com' });
    expect(store.all()).toHaveLength(2);
  });

  test('persists across instances', () => {
    const cfg = tmpConfig();
    const store1 = new SitesStore(cfg);
    const site = store1.add({ url: 'https://example.com' });
    const store2 = new SitesStore(cfg);
    expect(store2.get(site.id)).not.toBeNull();
  });
});
