'use strict';

const { streamToBuffer } = require('./stream-to-buffer');

function makeReaderStream(chunks) {
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i < chunks.length) {
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        }
      };
    }
  };
}

async function* asyncIterable(chunks) {
  for (const chunk of chunks) yield chunk;
}

describe('streamToBuffer', () => {
  test('concatenates chunks from a WHATWG ReadableStream (getReader branch)', async () => {
    const stream = makeReaderStream([Buffer.from('hello '), Buffer.from('world')]);
    const buffer = await streamToBuffer(stream);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8')).toBe('hello world');
  });

  test('concatenates chunks from a Node async-iterable stream', async () => {
    const stream = asyncIterable([Buffer.from('foo'), Buffer.from('bar')]);
    const buffer = await streamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('foobar');
  });

  test('returns an empty Buffer for an empty getReader stream', async () => {
    const stream = makeReaderStream([]);
    const buffer = await streamToBuffer(stream);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(0);
  });

  test('returns an empty Buffer for an empty async-iterable stream', async () => {
    const stream = asyncIterable([]);
    const buffer = await streamToBuffer(stream);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(0);
  });

  test('concatenates many chunks in order (multi-chunk)', async () => {
    const parts = Array.from({ length: 20 }, (_, i) => Buffer.from(`chunk${i}-`));
    const stream = makeReaderStream(parts);
    const buffer = await streamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe(parts.map(p => p.toString('utf8')).join(''));
  });

  test('accepts non-Buffer chunk values (e.g. Uint8Array) via Buffer.from', async () => {
    const stream = asyncIterable([new Uint8Array([104, 105]), new Uint8Array([33])]);
    const buffer = await streamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('hi!');
  });
});
