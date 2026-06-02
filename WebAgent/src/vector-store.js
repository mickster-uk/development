const fs = require('fs');
const path = require('path');

class VectorStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _filePath(siteId) {
    return path.join(this.dataDir, `${siteId}.json`);
  }

  load(siteId) {
    try {
      return JSON.parse(fs.readFileSync(this._filePath(siteId), 'utf8'));
    } catch {
      return [];
    }
  }

  save(siteId, chunks) {
    fs.writeFileSync(this._filePath(siteId), JSON.stringify(chunks), 'utf8');
  }

  // Merges chunks by id — updates existing, inserts new
  upsert(siteId, newChunks) {
    const existing = this.load(siteId);
    const byId = new Map(existing.map(c => [c.id, c]));
    for (const chunk of newChunks) {
      byId.set(chunk.id, chunk);
    }
    this.save(siteId, Array.from(byId.values()));
  }

  // Remove all chunks for a specific URL (used when a page is re-scraped)
  removeByUrl(siteId, url) {
    const chunks = this.load(siteId).filter(c => c.url !== url);
    this.save(siteId, chunks);
  }

  delete(siteId) {
    try { fs.unlinkSync(this._filePath(siteId)); } catch {}
  }

  stats(siteId) {
    const chunks = this.load(siteId);
    const urls = new Set(chunks.map(c => c.url));
    return { chunkCount: chunks.length, pageCount: urls.size };
  }

  _cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
  }

  search(queryEmbedding, { siteIds, limit = 5 } = {}) {
    const scored = [];
    let files;
    try {
      files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }

    for (const file of files) {
      const siteId = path.basename(file, '.json');
      if (siteIds && !siteIds.includes(siteId)) continue;

      const chunks = this.load(siteId);
      for (const chunk of chunks) {
        if (!chunk.embedding) continue;
        scored.push({
          siteId: chunk.siteId,
          url: chunk.url,
          title: chunk.title,
          section: chunk.section,
          content: chunk.content,
          scrapedAt: chunk.scrapedAt,
          score: this._cosine(queryEmbedding, chunk.embedding)
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

module.exports = { VectorStore };
