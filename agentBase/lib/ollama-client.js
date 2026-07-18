const http = require('http');
const https = require('https');

function transportError(err) {
  err.isTransport = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
  if (err.code === 'ECONNREFUSED') err.message = 'Cannot reach Ollama — is it running?';
  return err;
}

function post(endpoint, path, body, { timeoutMs, signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      let buffer = '';
      res.on('data', (chunk) => {
        if (onLine) {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.trim()) onLine(line);
          }
        } else {
          data += chunk;
        }
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(transportError(new Error(`Ollama returned ${res.statusCode}: ${data.slice(0, 300)}`)));
        } else if (onLine) {
          if (buffer.trim()) onLine(buffer);
          resolve(null);
        } else {
          try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
        }
      });
    });
    req.on('error', (err) => reject(transportError(err)));
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    if (signal) {
      const onAbort = () => req.destroy(Object.assign(new Error('Cancelled'), { cancelled: true }));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function chat({ endpoint, model, messages, format, options, timeoutMs, signal, onToken }) {
  if (!onToken) {
    const res = await post(endpoint, '/api/chat', { model, messages, format, options, stream: false }, { timeoutMs, signal });
    return res.message?.content ?? '';
  }
  let full = '';
  await post(endpoint, '/api/chat', { model, messages, options, stream: true }, {
    timeoutMs, signal,
    onLine: (line) => {
      try {
        const token = JSON.parse(line).message?.content || '';
        if (token) { full += token; onToken(token); }
      } catch { }
    }
  });
  return full;
}

function listModels(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/tags', endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve((JSON.parse(data).models || []).map((m) => m.name)); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', (err) => reject(transportError(err)));
    req.setTimeout(5000, () => req.destroy(new Error('Timed out')));
    req.end();
  });
}

module.exports = { chat, listModels };
