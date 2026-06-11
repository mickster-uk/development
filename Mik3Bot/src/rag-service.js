const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMBEDDING_MODEL = 'nomic-embed-text';
const CHUNK_MAX = 600;
const MIN_CHUNK_LEN = 40;
const SIMILARITY_THRESHOLD = 0.3;
const DEFAULT_TOP_K = 5;

class RAGService {
  constructor(knowledgePath, endpoint) {
    this.knowledgePath = knowledgePath;
    this.endpoint = endpoint;
    this.cachePath = path.join(knowledgePath, '.rag-cache.json');
    this.chunks = [];
    this.indexed = false;
    this.lastError = null;
    this.lastFileCount = 0;
  }

  async index() {
    this.indexed = false;
    this.lastError = null;
    const cache = this._loadCache();
    const newChunks = [];
    const newCache = {};

    const files = this._findFiles();
    this.lastFileCount = files.length;
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
        : filePath.endsWith('.csv')
          ? this._chunkCSV(content, source)
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
            const detail = e.response?.data?.error || e.message;
            console.error(`RAG: failed to embed chunk from ${source}:`, detail);
            this.lastError = `Embedding failed: ${detail}`;
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

    // Keyword fallback — catches proper nouns and compound merchant names that
    // semantic models score poorly (e.g. "HollywoodBowlGroup" as one token).
    // Splits camelCase/PascalCase so "HollywoodBowlGroup" → ["hollywood","bowl","group"].
    // Scored so exact matches (e.g. the actual transaction row) rank above documents
    // that merely mention the word in passing (e.g. a saved note about the problem).
    const queryLower = query.toLowerCase();
    const splitTerms = query
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2);

    const seenTexts = new Set(scored.map(c => c.text));
    const keyword = this.chunks
      .filter(c => !seenTexts.has(c.text))
      .map(c => {
        const tl = c.text.toLowerCase();
        const exactScore = tl.includes(queryLower) ? 3 : 0;
        const termScore = splitTerms.filter(t => tl.includes(t)).length;
        const rawScore = exactScore + termScore;
        // Normalise by chunk length: a short focused row containing the exact
        // merchant name ranks above a long document that mentions it in passing.
        const keyScore = rawScore / Math.log10(c.text.length + 10);
        return { text: c.text, source: c.source, keyScore };
      })
      .filter(c => c.keyScore > 0)
      .sort((a, b) => b.keyScore - a.keyScore)
      .slice(0, topK);

    const combined = [...scored, ...keyword];
    if (combined.length === 0) return '';
    return combined.map(c => `[${c.source}]\n${c.text}`).join('\n\n---\n\n');
  }

  getStatus() {
    return {
      indexed: this.indexed,
      chunkCount: this.chunks.length,
      fileCount: this.lastFileCount,
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
        else if (/\.(md|json|csv)$/i.test(entry.name)) results.push(full);
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
        if (section.trim().length >= MIN_CHUNK_LEN) chunks.push({ text: section.trim(), source });
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

    // Second pass: split still-oversized chunks line by line (handles big tables, long lists)
    // Table data rows are emitted individually so each transaction becomes its own chunk.
    const isTableRow = l => l.trim().startsWith('|') && !/^\s*\|[\s:\-|]+\|\s*$/.test(l);
    const result = [];
    for (const chunk of chunks) {
      if (chunk.text.length <= CHUNK_MAX) { result.push(chunk); continue; }
      let group = '';
      for (const line of chunk.text.split('\n')) {
        if (isTableRow(line)) {
          if (group.trim().length >= MIN_CHUNK_LEN) result.push({ text: group.trim(), source: chunk.source });
          group = '';
          if (line.trim().length >= MIN_CHUNK_LEN) result.push({ text: line.trim(), source: chunk.source });
        } else if (group && (group + '\n' + line).length > CHUNK_MAX) {
          if (group.trim().length >= MIN_CHUNK_LEN) result.push({ text: group.trim(), source: chunk.source });
          group = line;
        } else {
          group = group ? group + '\n' + line : line;
        }
      }
      if (group.trim().length >= MIN_CHUNK_LEN) result.push({ text: group.trim(), source: chunk.source });
    }
    return result;
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

  _chunkCSV(csvText, source) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const parseRow = (line) => {
      const cells = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      cells.push(current.trim());
      return cells;
    };

    const headers = parseRow(lines[0]);
    const lh = headers.map(h => h.toLowerCase().trim());
    const colIdx = (...names) => {
      for (const n of names) {
        const i = lh.findIndex(h => h === n || h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };

    const dateIdx   = colIdx('date', 'transaction date', 'value date', 'posting date');
    const descIdx   = colIdx('description', 'merchant', 'vendor', 'payee', 'narrative', 'details', 'reference', 'memo');
    const amtIdx    = colIdx('amount', 'sum', 'value');
    const debitIdx  = colIdx('debit', 'withdrawal', 'out');
    const creditIdx = colIdx('credit', 'deposit', 'in');

    const parseAmt = (str) => str ? parseFloat(str.replace(/[£$€,\s]/g, '')) : NaN;

    const rows = lines.slice(1).map(l => parseRow(l));

    // One chunk per transaction row — focused embedding for merchant/vendor search
    const rowChunks = rows
      .map(vals => ({ text: headers.map((h, k) => `${h}: ${vals[k] ?? ''}`).join(', '), source }))
      .filter(c => c.text.length >= MIN_CHUNK_LEN);

    // Daily summary chunks — one per date for "what did I spend on X" queries
    if (dateIdx < 0 || descIdx < 0 || (amtIdx < 0 && debitIdx < 0)) return rowChunks;

    const byDate = new Map();
    for (const vals of rows) {
      const date = (vals[dateIdx] || '').trim();
      if (date) {
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(vals);
      }
    }

    const dailyChunks = [];
    for (const [date, dayRows] of byDate) {
      let net = 0;
      const txLines = [];
      for (const vals of dayRows) {
        const desc = (vals[descIdx] || '').trim() || '(no description)';
        let rowAmt = NaN;
        if (amtIdx >= 0) {
          rowAmt = parseAmt(vals[amtIdx]);
        } else {
          const d = parseAmt(vals[debitIdx]);
          const c = parseAmt(vals[creditIdx >= 0 ? creditIdx : -1]);
          if (!isNaN(d)) rowAmt = -Math.abs(d);
          else if (!isNaN(c)) rowAmt = Math.abs(c);
        }
        if (!isNaN(rowAmt)) net += rowAmt;
        const amtStr = amtIdx >= 0 ? (vals[amtIdx] || '') : (!isNaN(rowAmt) ? rowAmt.toFixed(2) : '');
        txLines.push(`  ${desc}: ${amtStr}`);
      }
      const netLabel = net <= 0
        ? `spent £${Math.abs(net).toFixed(2)}`
        : `received £${net.toFixed(2)}`;
      const text = `${date} — ${dayRows.length} transaction${dayRows.length !== 1 ? 's' : ''}, ${netLabel}\n${txLines.join('\n')}`;
      if (text.length >= MIN_CHUNK_LEN) dailyChunks.push({ text, source });
    }

    return [...rowChunks, ...dailyChunks];
  }

  async _embed(text) {
    const safeText = text.length > CHUNK_MAX * 2 ? text.slice(0, CHUNK_MAX * 2) : text;
    try {
      // Try new Ollama API (/api/embed, returns embeddings[0])
      const response = await axios.post(
        `${this.endpoint}/api/embed`,
        { model: EMBEDDING_MODEL, input: safeText },
        { timeout: 30000 }
      );
      const vec = response.data?.embeddings?.[0];
      if (vec) return vec;
    } catch (_) {}

    // Fall back to legacy API (/api/embeddings, returns embedding)
    const response = await axios.post(
      `${this.endpoint}/api/embeddings`,
      { model: EMBEDDING_MODEL, prompt: safeText },
      { timeout: 30000 }
    );
    const vec = response.data?.embedding;
    if (!vec) throw new Error('No embedding returned — is nomic-embed-text pulled in Ollama?');
    return vec;
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
