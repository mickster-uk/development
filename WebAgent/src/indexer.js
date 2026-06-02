const crypto = require('crypto');
const { crawl } = require('./crawler');
const { embed } = require('./embedder');

const CHUNK_MAX = 1500;
const MIN_CHUNK = 60;

function chunkMarkdown(text) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    const joined = current ? `${current}\n\n${p}` : p;
    if (joined.length > CHUNK_MAX && current) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = joined;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Second pass: split oversized chunks (e.g. large tables) line by line
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= CHUNK_MAX) {
      result.push(chunk);
    } else {
      let sub = '';
      for (const line of chunk.split('\n')) {
        const joined = sub ? `${sub}\n${line}` : line;
        if (joined.length > CHUNK_MAX && sub) {
          result.push(sub.trim());
          sub = line;
        } else {
          sub = joined;
        }
      }
      if (sub.trim()) result.push(sub.trim());
    }
  }

  return result.filter(c => c.length >= MIN_CHUNK);
}

function contentHash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

// Indexes a site: crawls, chunks, embeds, returns chunks ready for upsert
async function indexSite(site, store, endpoint = 'http://localhost:11434') {
  let pagesIndexed = 0;

  await crawl(site.url, {
    maxDepth: site.maxDepth,
    maxPages: site.maxPages,
    onPage: async ({ url, title, markdown }) => {
      const chunks = chunkMarkdown(markdown);
      const newChunks = [];

      // Load existing chunks for this URL to detect unchanged content
      const existing = store.load(site.id);
      const existingByChunkIndex = new Map(
        existing.filter(c => c.url === url).map(c => [c.chunkIndex, c])
      );

      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const hash = contentHash(text);
        const id = `${site.id}::${encodeURIComponent(url)}::${i}`;

        // Skip re-embedding if content is unchanged
        const prior = existingByChunkIndex.get(i);
        if (prior && prior.hash === hash && prior.embedding) {
          newChunks.push(prior);
          continue;
        }

        try {
          const embedding = await embed(text, endpoint);
          newChunks.push({
            id,
            siteId: site.id,
            url,
            title,
            chunkIndex: i,
            section: `${i + 1}/${chunks.length}`,
            content: text,
            embedding,
            hash,
            scrapedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn(`[Indexer] Embed failed ${url} chunk ${i}: ${e.message}`);
        }
      }

      // Remove stale chunks for this URL (page may have fewer paragraphs now)
      store.removeByUrl(site.id, url);
      store.upsert(site.id, newChunks);
      pagesIndexed++;
    }
  });

  return pagesIndexed;
}

module.exports = { indexSite };
