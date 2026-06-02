const http = require('http');
const https = require('https');

const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const MAX_TEXT_CHARS = 8000;

function post(endpoint, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const transport = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 11434),
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(new Error(`Invalid JSON from ${path}: ${buf.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function embed(text, endpoint = 'http://localhost:11434') {
  const input = text.slice(0, MAX_TEXT_CHARS);

  // Try new Ollama /api/embed first (returns embeddings[0])
  try {
    const { body } = await post(endpoint, '/api/embed', { model: EMBED_MODEL, input });
    if (Array.isArray(body.embeddings?.[0])) return body.embeddings[0];
  } catch {}

  // Fall back to old /api/embeddings (returns embedding)
  const { body } = await post(endpoint, '/api/embeddings', { model: EMBED_MODEL, prompt: input });
  if (!Array.isArray(body.embedding)) throw new Error(`No embedding returned. Body: ${JSON.stringify(body).slice(0, 200)}`);
  return body.embedding;
}

module.exports = { embed };
