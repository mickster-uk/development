const http = require('http');
const { chat, listModels } = require('./ollama-client');

let server;

function serve(handler) {
  server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

afterEach(() => new Promise((resolve) => {
  if (!server) return resolve();
  server.close(() => resolve());
  server = null;
}));

describe('chat', () => {
  test('non-streaming returns message content and posts stream:false with format', async () => {
    let body;
    const endpoint = await serve((req, res) => {
      let data = '';
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        body = JSON.parse(data);
        res.end(JSON.stringify({ message: { content: 'hello' } }));
      });
    });
    const out = await chat({ endpoint, model: 'm', messages: [{ role: 'user', content: 'hi' }], format: { type: 'object' } });
    expect(out).toBe('hello');
    expect(body.stream).toBe(false);
    expect(body.format).toEqual({ type: 'object' });
  });

  test('missing message content resolves to an empty string', async () => {
    const endpoint = await serve((req, res) => res.end('{}'));
    expect(await chat({ endpoint, model: 'm', messages: [] })).toBe('');
  });

  test('streaming reassembles tokens split across chunk boundaries and skips bad lines', async () => {
    const line = (content) => JSON.stringify({ message: { content } }) + '\n';
    const payload = line('Hel') + line('lo ') + 'not json\n' + JSON.stringify({ message: { content: 'world' } });
    const endpoint = await serve((req, res) => {
      res.write(payload.slice(0, 20));
      setTimeout(() => {
        res.write(payload.slice(20, 45));
        setTimeout(() => res.end(payload.slice(45)), 5);
      }, 5);
    });
    const tokens = [];
    const out = await chat({ endpoint, model: 'm', messages: [], onToken: (t) => tokens.push(t) });
    expect(out).toBe('Hello world');
    expect(tokens.join('')).toBe('Hello world');
  });

  test('non-2xx responses reject with the status code', async () => {
    const endpoint = await serve((req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await expect(chat({ endpoint, model: 'm', messages: [] })).rejects.toThrow(/Ollama returned 500/);
  });

  test('connection refused is flagged as a transport error with a friendly message', async () => {
    const endpoint = await serve((req, res) => res.end('{}'));
    await new Promise((resolve) => server.close(resolve));
    server = null;
    await expect(chat({ endpoint, model: 'm', messages: [] })).rejects.toMatchObject({
      isTransport: true,
      message: expect.stringMatching(/is it running/)
    });
  });
});

describe('listModels', () => {
  test('returns model names', async () => {
    const endpoint = await serve((req, res) => res.end(JSON.stringify({ models: [{ name: 'a' }, { name: 'b' }] })));
    expect(await listModels(endpoint)).toEqual(['a', 'b']);
  });

  test('missing models array resolves to an empty list', async () => {
    const endpoint = await serve((req, res) => res.end('{}'));
    expect(await listModels(endpoint)).toEqual([]);
  });
});
