const { JSDOM } = require('jsdom');
const { scrape } = require('./scraper');

const POLITE_DELAY_MS = 600;

function extractInternalLinks(html, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const dom = new JSDOM(html, { url: baseUrl });
    const seen = new Set();
    dom.window.document.querySelectorAll('a[href]').forEach(a => {
      try {
        const u = new URL(a.getAttribute('href'), baseUrl);
        // Same origin only, strip fragment and query params that cause duplicates
        if (u.hostname === base.hostname && u.protocol.startsWith('http')) {
          u.hash = '';
          const key = u.toString();
          seen.add(key);
        }
      } catch {}
    });
    return [...seen];
  } catch {
    return [];
  }
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Crawls a site starting from rootUrl.
// Calls onPage(result) for each successfully scraped page.
// Returns array of all results.
async function crawl(rootUrl, { maxDepth = 2, maxPages = 50, onPage } = {}) {
  const visited = new Set();
  const queue = [{ url: rootUrl, depth: 0 }];
  const results = [];

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const page = await scrape(url);
      if (!page) continue;

      const result = { url, title: page.title, markdown: page.markdown, excerpt: page.excerpt };
      results.push(result);
      if (onPage) await onPage(result);

      if (depth < maxDepth && page.html) {
        const links = extractInternalLinks(page.html, url);
        for (const link of links) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    } catch (e) {
      console.warn(`[Crawler] Skipped ${url}: ${e.message}`);
    }

    await delay(POLITE_DELAY_MS);
  }

  return results;
}

module.exports = { crawl };
