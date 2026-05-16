# Bot Tester

An Electron application for testing bot responses using a three-bot evaluation system, with optional RAG (Retrieval-Augmented Generation) to ground Bot 2's answers in your own knowledge articles.

## Features

- **Three-Bot System**:
  - **Bot 1** — Query Generator: rewrites the user's input as a persona-driven query
  - **Bot 2** — Responder: answers Bot 1's query, optionally grounded in your knowledge base
  - **Bot 3** — Evaluator: judges whether Bot 2's response correctly answers Bot 1's query

- **RAG Knowledge Base**:
  - Drop `.md` or `.json` articles into the `knowledge/` folder
  - Chunks are embedded locally via `nomic-embed-text` (Ollama) — no external API needed
  - Embedding cache keeps re-indexing fast after the first run
  - Relevant passages are automatically injected into Bot 2's context on each test

- **Configurable Personas**:
  - Bot 1: personality, tone, and vulnerability flags (depression, ESL, PCI data, etc.)
  - Bot 2: personality, tone, and response style
  - Randomise either persona per-run for broad coverage

- **Test History & Export**:
  - Full history with per-run config tags
  - Export as Jest `.test.js` or JUnit XML for CI integration

- **Modern UI**:
  - Dark theme with animated header
  - Real-time per-step feedback (generating indicators, correct/incorrect badges)
  - Collapsible input panel

## Requirements

- Node.js 18+
- [Ollama](https://ollama.ai/) running locally
- At least one chat model pulled (e.g. `mistral`, `llama3`)
- `nomic-embed-text` pulled for RAG: `ollama pull nomic-embed-text`

## Installation

```bash
npm install
```

## Setup

### 1. Start Ollama

```bash
ollama serve
```

### 2. Pull models

```bash
# Chat models for the three bots
ollama pull mistral

# Embedding model for RAG
ollama pull nomic-embed-text
```

### 3. Add knowledge articles (optional)

Drop `.md` or `.json` files into the `knowledge/` folder. Subfolders are supported.

### 4. Start the app

```bash
npm start
```

## Configuration

Open the Settings panel (gear icon, top right):

| Setting | Description |
|---|---|
| LLM Endpoint | URL of your Ollama instance (default: `http://localhost:11434`) |
| Bot 1 Model | Query generator model |
| Bot 2 Model | Responder model |
| Bot 3 Model | Evaluator model |

After adding or editing knowledge articles, click **Re-index Knowledge Base** in Settings.

## Usage

1. Enter a query and click **Run Test** (or press Enter)
2. Bot 1 rewrites it using the selected persona
3. Bot 2 answers — with relevant knowledge passages injected if the knowledge base is indexed
4. Bot 3 evaluates the answer and returns a confidence score and reasoning

## Project Structure

```
BotTester/
├── main.js                   # Electron main process + IPC handlers
├── preload.js                # Secure IPC bridge (contextBridge)
├── index.html                # UI markup
├── styles.css                # Styling
├── renderer.js               # UI logic and event handlers
├── package.json
├── knowledge/                # Drop .md / .json articles here
│   └── sample-article.md
└── src/
    ├── bot-orchestrator.js   # Three-bot coordination logic
    └── rag-service.js        # RAG: chunking, embedding, retrieval
```

## RAG Details

- **Embedding model**: `nomic-embed-text` via Ollama (`/api/embeddings`)
- **Chunking**: Markdown split by headings then paragraphs (~600 chars max); JSON split by array item or top-level key
- **Retrieval**: Cosine similarity, top-3 chunks above a 0.3 threshold
- **Cache**: `knowledge/.rag-cache.json` — unchanged chunks are never re-embedded

## Technical Stack

- **Framework**: Electron
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **HTTP client**: Axios
- **Storage**: JSON files in Electron user data directory

## Building

```bash
npm run build
```

## License

MIT
