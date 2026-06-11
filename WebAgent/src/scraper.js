const axios = require('axios');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
// Keep table structure in markdown
turndown.keep(['table']);

const USER_AGENT = 'Mozilla/5.0 (compatible; WebAgent/1.0; +https://github.com/mikefinch)';
const MIN_CONTENT_LENGTH = 150;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

async function fetchStatic(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    responseType: 'text',
    maxContentLength: MAX_CONTENT_BYTES,
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' }
  });
  return res.data;
}

async function fetchWithPlaywright(url) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'User-Agent': USER_AGENT });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

function parseContent(html, url) {
  let dom;
  try {
    dom = new JSDOM(html, { url });
  } catch {
    return null;
  }
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  const markdown = turndown.turndown(article.content || '').trim();
  return {
    title: article.title?.trim() || new URL(url).hostname,
    markdown,
    excerpt: article.excerpt?.trim() || ''
  };
}

// Returns { title, markdown, excerpt, html }
// Falls back to Playwright if static content is too short
async function scrape(url) {
  let html = null;

  try {
    html = await fetchStatic(url);
    const content = parseContent(html, url);
    if (content && content.markdown.length >= MIN_CONTENT_LENGTH) {
      return { ...content, html };
    }
  } catch (e) {
    // Static fetch failed — try Playwright
  }

  try {
    html = await fetchWithPlaywright(url);
    const content = parseContent(html, url);
    return content ? { ...content, html } : null;
  } catch (e) {
    throw new Error(`Failed to scrape ${url}: ${e.message}`);
  }
}

module.exports = { scrape, parseContent };
