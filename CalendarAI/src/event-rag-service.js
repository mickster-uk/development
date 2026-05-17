const axios = require('axios');

const EMBEDDING_MODEL = 'nomic-embed-text';
const SIMILARITY_THRESHOLD = 0.25;
const DEFAULT_TOP_K = 5;

class EventRAGService {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.items = [];
    this.indexed = false;
    this.indexing = false;
    this.progress = { current: 0, total: 0 };
    this.lastError = null;
  }

  async indexEvents(events, eventToText, onProgress) {
    this.indexed = false;
    this.indexing = true;
    this.lastError = null;
    this.progress = { current: 0, total: events.length };
    const items = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const text = eventToText(event);
      try {
        const embedding = await this._embed(text);
        items.push({ text, event, embedding });
      } catch (e) {
        this.lastError = `Embedding failed — is "${EMBEDDING_MODEL}" pulled in Ollama?`;
        console.error('EventRAG embed failed:', e.message);
      }
      this.progress = { current: i + 1, total: events.length };
      if (onProgress) onProgress(this.progress);
    }

    this.items = items;
    this.indexed = true;
    this.indexing = false;
    return { count: items.length };
  }

  async retrieve(query, topK = DEFAULT_TOP_K) {
    if (!this.indexed || !this.items.length) return [];
    let queryEmb;
    try {
      queryEmb = await this._embed(query);
    } catch {
      return [];
    }
    return this.items
      .map(item => ({ ...item, score: this._cosine(queryEmb, item.embedding) }))
      .filter(item => item.score > SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  getStatus() {
    return {
      indexed: this.indexed,
      indexing: this.indexing,
      count: this.items.length,
      progress: this.progress,
      lastError: this.lastError
    };
  }

  async _embed(text) {
    const res = await axios.post(
      `${this.endpoint}/api/embeddings`,
      { model: EMBEDDING_MODEL, prompt: text },
      { timeout: 30000 }
    );
    if (!res.data?.embedding) throw new Error('No embedding returned');
    return res.data.embedding;
  }

  _cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2;
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }
}

module.exports = { EventRAGService };
