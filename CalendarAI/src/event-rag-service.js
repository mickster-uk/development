const axios = require('axios');

const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text';
const SIMILARITY_THRESHOLD = 0.4;
const DEFAULT_TOP_K = 5;

class EventRAGService {
  constructor(endpoint, embeddingModel = DEFAULT_EMBEDDING_MODEL) {
    this.endpoint = endpoint;
    this.embeddingModel = embeddingModel;
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

    // Fail fast: test the first event before committing to the full loop
    if (events.length > 0) {
      try {
        await this._embed(eventToText(events[0]));
      } catch (e) {
        const detail = e.response?.data?.error || e.message;
        this.lastError = `Embedding failed: ${detail}. Run: ollama pull ${this.embeddingModel}`;
        this.indexed = true;
        this.indexing = false;
        return { count: 0 };
      }
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const text = eventToText(event);
      try {
        const embedding = await this._embed(text);
        items.push({ text, event, embedding });
      } catch (e) {
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

  retrieveByDateRange(start, end) {
    if (!this.items.length) return [];
    return this.items.filter(item => {
      const raw = item.event.start?.dateTime || item.event.start?.date;
      if (!raw) return false;
      const d = new Date(raw);
      return d >= start && d < end;
    });
  }

  async retrieve(query, topK = DEFAULT_TOP_K, threshold = SIMILARITY_THRESHOLD) {
    if (!this.indexed || !this.items.length) return [];
    let queryEmb;
    try {
      queryEmb = await this._embed(query);
    } catch {
      return [];
    }
    return this.items
      .map(item => ({ ...item, score: this._cosine(queryEmb, item.embedding) }))
      .filter(item => item.score > threshold)
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
      { model: this.embeddingModel, prompt: text },
      { timeout: 8000 }
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
