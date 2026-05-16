const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMBEDDING_MODEL = 'nomic-embed-text';
const CHUNK_MAX = 600;
const MIN_CHUNK_LEN = 40;
const SIMILARITY_THRESHOLD = 0.3;
const DEFAULT_TOP_K = 3;

class RAGService {
  constructor(knowledgePath, endpoint) {
    this.knowledgePath = knowledgePath;
    this.endpoint = endpoint;
    this.cachePath = path.join(knowledgePath, '.rag-cache.json');
    this.chunks = [];
    this.indexed = false;
    this.lastError = null;
  }

  async index() {
    this.indexed = false;
    this.lastError = null;
    const cache = this._loadCache();
    const newChunks = [];
    const newCache = {};

    const files = this._findFiles();
    if (files.length === 0) {
      this.chunks = [];
      this.indexed = true;
      return { chunkCount: 0, fileCount: 0 };
    }

    for (const filePath of files) {
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        console.error(`RAG: cannot read ${filePath}:`, e.message);
        continue;
      }

      const source = path.relative(this.knowledgePath, filePath);
      const rawChunks = filePath.endsWith('.json')
        ? this._chunkJSON(content, source)
        : this._chunkMarkdown(content, source);

      for (const chunk of rawChunks) {
        const hash = crypto.createHash('sha256').update(chunk.text).digest('hex');
        if (cache[hash]) {
          newChunks.push({ text: chunk.text, source: chunk.source, embedding: cache[hash] });
          newCache[hash] = cache[hash];
        } else {
          try {
            const embedding = await this._embed(chunk.text);
            newChunks.push({ text: chunk.text, source: chunk.source, embedding });
            newCache[hash] = embedding;
          } catch (e) {
            console.error(`RAG: failed to embed chunk from ${source}:`, e.message);
            this.lastError = `Embedding failed — is "${EMBEDDING_MODEL}" pulled in Ollama?`;
          }
        }
      }
    }

    this._saveCache(newCache);
    this.chunks = newChunks;
    this.indexed = true;
    return { chunkCount: this.chunks.length, fileCount: files.length };
  }

  async retrieve(query, topK = DEFAULT_TOP_K) {
    if (!this.indexed || this.chunks.length === 0) return '';

    let queryEmbedding;
    try {
      queryEmbedding = await this._embed(query);
    } catch (e) {
      console.error('RAG: failed to embed query:', e.message);
      return '';
    }

    const scored = this.chunks
      .map(chunk => ({
        text: chunk.text,
        source: chunk.source,
        score: this._cosine(queryEmbedding, chunk.embedding)
      }))
      .filter(c => c.score > SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (scored.length === 0) return '';
    return scored.map(c => `[${c.source}]\n${c.text}`).join('\n\n---\n\n');
  }

  getStatus() {
    return {
      indexed: this.indexed,
      chunkCount: this.chunks.length,
      knowledgePath: this.knowledgePath,
      lastError: this.lastError
    };
  }

  // ── private ──────────────────────────────────────────────────────────────

  _findFiles() {
    if (!fs.existsSync(this.knowledgePath)) return [];
    const results = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(md|json)$/i.test(entry.name)) results.push(full);
      }
    };
    walk(this.knowledgePath);
    return results;
  }

  _chunkMarkdown(text, source) {
    const sections = text.split(/(?=^#{1,3}\s)/m).filter(s => s.trim().length > 0);
    const chunks = [];

    for (const section of sections) {
      if (section.length <= CHUNK_MAX) {
        if (section.trim().length >= MIN_CHUNK_LEN) {
          chunks.push({ text: section.trim(), source });
        }
        continue;
      }
      const paragraphs = section.split(/\n\n+/).filter(p => p.trim().length > 0);
      let current = '';
      for (const para of paragraphs) {
        if (current && (current + '\n\n' + para).length > CHUNK_MAX) {
          if (current.trim().length >= MIN_CHUNK_LEN) chunks.push({ text: current.trim(), source });
          current = para;
        } else {
          current = current ? current + '\n\n' + para : para;
        }
      }
      if (current.trim().length >= MIN_CHUNK_LEN) chunks.push({ text: current.trim(), source });
    }

    return chunks;
  }

  _chunkJSON(text, source) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data
          .map((item, i) => ({
            text: typeof item === 'string' ? item : JSON.stringify(item, null, 2),
            source: `${source}[${i}]`
          }))
          .filter(c => c.text.length >= MIN_CHUNK_LEN);
      }
      return Object.entries(data)
        .map(([key, val]) => ({
          text: `${key}: ${typeof val === 'string' ? val : JSON.stringify(val, null, 2)}`,
          source: `${source}.${key}`
        }))
        .filter(c => c.text.length >= MIN_CHUNK_LEN);
    } catch {
      const trimmed = text.trim().substring(0, 1000);
      return trimmed.length >= MIN_CHUNK_LEN ? [{ text: trimmed, source }] : [];
    }
  }

  async _embed(text) {
    const response = await axios.post(
      `${this.endpoint}/api/embeddings`,
      { model: EMBEDDING_MODEL, prompt: text },
      { timeout: 30000 }
    );
    if (!response.data || !response.data.embedding) {
      throw new Error('No embedding returned from Ollama');
    }
    return response.data.embedding;
  }

  _cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  _loadCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        return JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      }
    } catch {}
    return {};
  }

  _saveCache(cache) {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(cache), 'utf8');
    } catch (e) {
      console.error('RAG: failed to save cache:', e.message);
    }
  }
}

module.exports = { RAGService };
