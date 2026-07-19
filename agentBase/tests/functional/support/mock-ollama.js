const http = require('http');

function startMockOllama({ tagsModels = ['test-model:latest'], chatContent = 'Mock agent output.', gateVerdict = { score: 9, reason: 'Meets the bar.' } } = {}) {
  const calls = [];

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: tagsModels.map((name) => ({ name })) }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch { }
        calls.push(body);

        if (body.format) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { content: JSON.stringify(gateVerdict) } }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        const words = chatContent.split(' ');
        for (const w of words) {
          res.write(JSON.stringify({ message: { content: `${w} ` } }) + '\n');
        }
        res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

module.exports = { startMockOllama };
