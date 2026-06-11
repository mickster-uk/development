'use strict';

const { extractInternalLinks } = require('./crawler');

describe('extractInternalLinks', () => {
  const base = 'https://example.com/page';

  test('extracts links with same hostname', () => {
    const html = '<a href="https://example.com/other">link</a>';
    const links = extractInternalLinks(html, base);
    expect(links).toContain('https://example.com/other');
  });

  test('resolves relative links against base URL', () => {
    const html = '<a href="/about">About</a>';
    const links = extractInternalLinks(html, base);
    expect(links).toContain('https://example.com/about');
  });

  test('excludes external links', () => {
    const html = '<a href="https://other.com/page">External</a>';
    const links = extractInternalLinks(html, base);
    expect(links).toHaveLength(0);
  });

  test('strips fragment identifiers', () => {
    const html = '<a href="/page#section">Anchor</a>';
    const links = extractInternalLinks(html, base);
    expect(links).toContain('https://example.com/page');
    links.forEach(l => expect(l).not.toContain('#'));
  });

  test('deduplicates identical URLs', () => {
    const html = '<a href="/page">A</a><a href="/page">B</a>';
    const links = extractInternalLinks(html, base);
    expect(links.filter(l => l === 'https://example.com/page')).toHaveLength(1);
  });

  test('returns empty array for empty HTML', () => {
    expect(extractInternalLinks('<html></html>', base)).toEqual([]);
  });

  test('returns empty array for malformed base URL', () => {
    expect(extractInternalLinks('<a href="/page">x</a>', 'not-a-url')).toEqual([]);
  });

  test('excludes non-http protocols (mailto, javascript)', () => {
    const html = '<a href="mailto:test@example.com">Email</a><a href="javascript:void(0)">JS</a>';
    const links = extractInternalLinks(html, base);
    expect(links).toHaveLength(0);
  });
});
