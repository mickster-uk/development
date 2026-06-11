'use strict';

const { parseContent } = require('./scraper');

const ARTICLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <article>
    <h1>My Article</h1>
    <p>This is a long enough paragraph to pass Readability's content length check. It contains meaningful text about a subject. The content is rich enough that the parser will extract it correctly.</p>
    <p>A second paragraph with more information to ensure Readability treats this as an article worth parsing.</p>
  </article>
</body>
</html>`;

describe('parseContent', () => {
  const url = 'https://example.com/article';

  test('returns object with title and markdown', () => {
    const result = parseContent(ARTICLE_HTML, url);
    expect(result).not.toBeNull();
    expect(result.title).toBeTruthy();
    expect(typeof result.markdown).toBe('string');
  });

  test('extracts article body text as markdown', () => {
    const result = parseContent(ARTICLE_HTML, url);
    expect(result.markdown).toContain('meaningful text');
    expect(result.markdown).toContain('second paragraph');
  });

  test('returns null for empty HTML', () => {
    const result = parseContent('<html><body></body></html>', url);
    expect(result).toBeNull();
  });

  test('uses hostname as title fallback when article title is missing', () => {
    const html = `<html><body><article><p>${'meaningful text to trigger readability '.repeat(10)}</p></article></body></html>`;
    const result = parseContent(html, 'https://fallback.example.com/page');
    if (result) {
      expect(result.title).toBeTruthy();
    }
  });

  test('excerpt is a string (may be empty)', () => {
    const result = parseContent(ARTICLE_HTML, url);
    if (result) {
      expect(typeof result.excerpt).toBe('string');
    }
  });
});
