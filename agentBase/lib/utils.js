const { URL } = require('url');

function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return 'http://localhost:11434';
  }
  let normalized = endpoint.trim();
  if (!normalized.match(/^https?:\/\//)) {
    normalized = `http://${normalized}`;
  }
  try {
    const url = new URL(normalized);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return 'http://localhost:11434';
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { normalizeEndpoint, parseJson };
