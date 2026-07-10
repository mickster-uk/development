'use strict';

const { stripMarkdown } = require('./strip-markdown');

describe('stripMarkdown', () => {
  test('strips ATX headings of all levels', () => {
    expect(stripMarkdown('# Heading')).toBe('Heading');
    expect(stripMarkdown('## Sub Heading')).toBe('Sub Heading');
    expect(stripMarkdown('###### Deep Heading')).toBe('Deep Heading');
  });

  test('strips bold markers, both ** and __ forms', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
    expect(stripMarkdown('__bold text__')).toBe('bold text');
  });

  test('strips italic markers, both * and _ forms', () => {
    expect(stripMarkdown('*italic text*')).toBe('italic text');
    expect(stripMarkdown('_italic text_')).toBe('italic text');
  });

  test('strips inline code backticks', () => {
    expect(stripMarkdown('`inline code`')).toBe('inline code');
  });

  test('removes fenced code blocks entirely', () => {
    const input = '```js\nconst x = 1;\nconsole.log(x);\n```';
    expect(stripMarkdown(input)).toBe('');
  });

  test('keeps image alt text and drops the URL', () => {
    expect(stripMarkdown('![alt text](http://example.com/img.png)')).toBe('alt text');
  });

  test('keeps link text and drops the URL', () => {
    expect(stripMarkdown('[link text](http://example.com)')).toBe('link text');
  });

  test('distinguishes images from links in the same string', () => {
    const input = 'See ![a diagram](http://x.com/d.png) and [the docs](http://x.com/docs)';
    expect(stripMarkdown(input)).toBe('See a diagram and the docs');
  });

  test('strips blockquote markers', () => {
    expect(stripMarkdown('> A quoted line')).toBe('A quoted line');
  });

  test('strips bullet list markers (-, *, +)', () => {
    expect(stripMarkdown('- item one\n- item two\n* item three\n+ item four'))
      .toBe('item one\nitem two\nitem three\nitem four');
  });

  test('strips numbered list markers regardless of digit count', () => {
    expect(stripMarkdown('1. first\n2. second\n10. tenth')).toBe('first\nsecond\ntenth');
  });

  test('strips horizontal rules made of three or more dashes', () => {
    expect(stripMarkdown('---')).toBe('');
    expect(stripMarkdown('Before\n\n---\n\nAfter')).toBe('Before\n\n\nAfter');
  });

  test('strips mixed markdown in a realistic paragraph and reads naturally', () => {
    const input = [
      '# Title',
      '',
      'This is **bold** and *italic* text with `code` and a [link](http://x.com) and an ![image](http://y.com/i.png).',
      '',
      '> A quote',
      '',
      '- item 1',
      '- item 2',
      '',
      '---'
    ].join('\n');

    const output = stripMarkdown(input);

    expect(output).toBe(
      'Title\n\nThis is bold and italic text with code and a link and an image.\n\nA quote\n\nitem 1\nitem 2'
    );
    expect(output).not.toMatch(/[#*_`]/);
    expect(output).not.toMatch(/\[.*\]\(.*\)/);
  });
});
