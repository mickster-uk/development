const express = require('express');
const path = require('path');
const { VectorStore } = require('./vector-store');
const { SitesStore } = require('./sites-store');
const { indexSite } = require('./indexer');
const { embed } = require('./embedder');
const { startScheduler } = require('./scheduler');
const pkg = require('../package.json');

const PORT = parseInt(process.env.PORT || '57422', 10);
const DATA_DIR = path.join(__dirname, '..', 'data');

let ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';

const vectorStore = new VectorStore(path.join(DATA_DIR, 'vectors'));
const sitesStore = new SitesStore(path.join(DATA_DIR, 'sites.json'));

// Track active scrape jobs: siteId → { running, pagesIndexed, startedAt, error }
const jobs = new Map();

function startScrape(site) {
  const job = { running: true, pagesIndexed: 0, startedAt: new Date().toISOString(), error: null };
  jobs.set(site.id, job);
  sitesStore.update(site.id, { status: 'indexing' });

  indexSite(site, vectorStore, ollamaEndpoint)
    .then(count => {
      job.running = false;
      job.pagesIndexed = count;
      sitesStore.update(site.id, { status: 'ready', lastScrapedAt: new Date().toISOString() });
      console.log(`[Server] "${site.name}" indexed — ${count} page(s)`);
    })
    .catch(e => {
      job.running = false;
      job.error = e.message;
      sitesStore.update(site.id, { status: 'error' });
      console.error(`[Server] "${site.name}" failed: ${e.message}`);
    });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'ui')));

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, version: pkg.version, port: PORT, ollamaEndpoint });
});

// ── Sites ─────────────────────────────────────────────────────────────────
app.get('/api/sites', (req, res) => {
  const sites = sitesStore.all().map(s => ({
    ...s,
    stats: vectorStore.stats(s.id),
    job: jobs.get(s.id) || null
  }));
  res.json(sites);
});

app.post('/api/sites', (req, res) => {
  const { url, name, maxDepth, maxPages } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'url is not valid' });
  }
  const site = sitesStore.add({ url, name, maxDepth, maxPages });
  res.status(201).json(site);
});

app.get('/api/sites/:id', (req, res) => {
  const site = sitesStore.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Not found' });
  res.json({ ...site, stats: vectorStore.stats(site.id), job: jobs.get(site.id) || null });
});

app.delete('/api/sites/:id', (req, res) => {
  const site = sitesStore.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Not found' });
  if (jobs.get(site.id)?.running) return res.status(409).json({ error: 'Scrape in progress — wait or restart service' });
  sitesStore.remove(site.id);
  vectorStore.delete(site.id);
  jobs.delete(site.id);
  res.json({ ok: true });
});

// ── Scrape trigger ────────────────────────────────────────────────────────
app.post('/api/sites/:id/scrape', (req, res) => {
  const site = sitesStore.get(req.params.id);
  if (!site) return res.status(404).json({ error: 'Not found' });
  if (jobs.get(site.id)?.running) return res.status(409).json({ error: 'Scrape already running' });
  startScrape(site);
  res.json({ ok: true, message: 'Scrape started', siteId: site.id });
});

// ── Search ────────────────────────────────────────────────────────────────
// POST /api/search  { query, siteIds?, limit? }
// Returns: { results: [{ siteId, url, title, section, content, scrapedAt, score }] }
app.post('/api/search', async (req, res) => {
  const { query, siteIds, limit = 5 } = req.body;
  if (!query || typeof query !== 'string') return res.status(400).json({ error: 'query is required' });

  try {
    const queryEmbedding = await embed(query.trim(), ollamaEndpoint);
    const results = vectorStore.search(queryEmbedding, {
      siteIds: Array.isArray(siteIds) ? siteIds : undefined,
      limit: Math.min(parseInt(limit, 10) || 5, 20)
    });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Config ────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ ollamaEndpoint, port: PORT });
});

app.put('/api/config', (req, res) => {
  if (req.body.ollamaEndpoint) {
    try { new URL(req.body.ollamaEndpoint); } catch { return res.status(400).json({ error: 'Invalid ollamaEndpoint' }); }
    ollamaEndpoint = req.body.ollamaEndpoint;
  }
  res.json({ ok: true, ollamaEndpoint });
});

// ── Start ─────────────────────────────────────────────────────────────────
function start() {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`WebAgent v${pkg.version} running at http://localhost:${PORT}`);
    console.log(`Ollama endpoint: ${ollamaEndpoint}`);
  });

  startScheduler(sitesStore, vectorStore, () => ollamaEndpoint);
}

module.exports = { start };
