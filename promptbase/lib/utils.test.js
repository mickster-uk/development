'use strict';

const { normalizeEndpoint, isChatModel, normalizeModelList, parseTemplateMarkdown } = require('./utils');

// ── normalizeEndpoint ─────────────────────────────────────────────────────────

describe('normalizeEndpoint', () => {
  test('returns default for null', () => {
    expect(normalizeEndpoint(null)).toBe('http://localhost:11434/v1');
  });

  test('returns default for empty string', () => {
    expect(normalizeEndpoint('')).toBe('http://localhost:11434/v1');
  });

  test('strips trailing slashes', () => {
    expect(normalizeEndpoint('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(normalizeEndpoint('http://localhost:11434///')).toBe('http://localhost:11434');
  });

  test('trims whitespace', () => {
    expect(normalizeEndpoint('  http://localhost:11434  ')).toBe('http://localhost:11434');
  });

  test('leaves clean URLs unchanged', () => {
    expect(normalizeEndpoint('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
  });
});

// ── isChatModel ───────────────────────────────────────────────────────────────

describe('isChatModel', () => {
  test('returns true for llama models', () => {
    expect(isChatModel('llama3')).toBe(true);
    expect(isChatModel('llama3.2')).toBe(true);
    expect(isChatModel('mistral')).toBe(true);
  });

  test('returns false for embedding models', () => {
    expect(isChatModel('nomic-embed-text')).toBe(false);
    expect(isChatModel('text-embedding-ada-002')).toBe(false);
    expect(isChatModel('all-minilm-embedding')).toBe(false);
  });

  test('is case-insensitive for embed pattern', () => {
    expect(isChatModel('NOMIC-EMBED-TEXT')).toBe(false);
    expect(isChatModel('My-Embedding-Model')).toBe(false);
  });

  test('returns false for non-string', () => {
    expect(isChatModel(null)).toBe(false);
    expect(isChatModel(42)).toBe(false);
  });
});

// ── normalizeModelList ────────────────────────────────────────────────────────

describe('normalizeModelList', () => {
  test('handles Ollama array format with name field', () => {
    const models = normalizeModelList([{ name: 'llama3' }, { name: 'mistral' }]);
    expect(models).toEqual(['llama3', 'mistral']);
  });

  test('handles OpenAI data array format with id field', () => {
    const models = normalizeModelList({ data: [{ id: 'gpt-4o' }, { id: 'gpt-3.5-turbo' }] });
    expect(models).toEqual(['gpt-4o', 'gpt-3.5-turbo']);
  });

  test('handles models property format', () => {
    const models = normalizeModelList({ models: [{ name: 'llama3' }] });
    expect(models).toEqual(['llama3']);
  });

  test('filters out embedding models', () => {
    const models = normalizeModelList([
      { name: 'llama3' },
      { name: 'nomic-embed-text' },
      { name: 'mistral' }
    ]);
    expect(models).not.toContain('nomic-embed-text');
    expect(models).toContain('llama3');
    expect(models).toContain('mistral');
  });

  test('returns all models if only embed models exist', () => {
    const models = normalizeModelList([{ name: 'nomic-embed-text' }]);
    expect(models).toEqual(['nomic-embed-text']);
  });
});

// ── parseTemplateMarkdown ─────────────────────────────────────────────────────

describe('parseTemplateMarkdown', () => {
  const template = `# Email Writer

## Use case
Write professional emails for various situations.

## Qualifying questions
- What is the purpose of the email?
- Who is the recipient?
`;

  test('extracts title from h1', () => {
    expect(parseTemplateMarkdown(template).title).toBe('Email Writer');
  });

  test('extracts first line of use case section', () => {
    expect(parseTemplateMarkdown(template).useCase).toBe('Write professional emails for various situations.');
  });

  test('extracts questions as an array', () => {
    const { questions } = parseTemplateMarkdown(template);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toBe('- What is the purpose of the email?');
    expect(questions[1]).toBe('- Who is the recipient?');
  });

  test('returns null title when no h1', () => {
    expect(parseTemplateMarkdown('## Use case\nSomething').title).toBeNull();
  });

  test('returns empty string useCase when no use case section', () => {
    expect(parseTemplateMarkdown('# Title').useCase).toBe('');
  });

  test('returns empty questions array when no qualifying questions section', () => {
    expect(parseTemplateMarkdown('# Title').questions).toEqual([]);
  });

  test('is case-insensitive for section headers', () => {
    const md = '# Title\n\n## USE CASE\nSomething useful\n';
    expect(parseTemplateMarkdown(md).useCase).toBe('Something useful');
  });
});
