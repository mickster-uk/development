# Bot Tester — Quick Start

## Prerequisites

- **Node.js** 18+
- **Ollama** installed and running — [ollama.ai](https://ollama.ai/)

---

## Step 1: Install dependencies

```bash
npm install
```

## Step 2: Pull models

You need at least one chat model and the embedding model for RAG:

```bash
ollama pull mistral          # or llama3, qwen2, etc.
ollama pull nomic-embed-text # required for the knowledge base
```

## Step 3: Add your knowledge articles (optional but recommended)

Drop `.md` or `.json` files into the `knowledge/` folder next to this file. Subfolders work too. The app will index them on startup.

```
knowledge/
├── your-policy.md
├── product-faq.md
└── procedures/
    └── onboarding.md
```

> **JSON format**: an array of strings, an array of objects, or a flat key→value object.

## Step 4: Start the app

```bash
npm start
```

## Step 5: Configure models

1. Click the gear icon (top right) to open Settings
2. Confirm the endpoint is `http://localhost:11434`
3. Click **Load Models**
4. Assign a model to each bot (you can use the same model for all three)
5. Click **Save Settings**

If you added knowledge articles, you'll see the chunk count under **Knowledge Base (RAG)**. Click **Re-index Knowledge Base** after adding or editing files.

## Step 6: Run your first test

1. Type a question in the input field, e.g. *"What is our refund policy?"*
2. Press **Enter** or click **Run Test**
3. Watch each bot step complete in real time:
   - **Bot 1** rewrites your question as a persona-driven query
   - **Bot 2** answers, drawing on your knowledge articles if relevant
   - **Bot 3** evaluates the answer and returns a confidence score

---

## How the three-bot pipeline works

```
Your input
    │
    ▼
Bot 1 — Query Generator
    │  rewrites your input as a user with a specific personality/tone
    ▼
Bot 2 — Responder
    │  answers the query; relevant knowledge passages injected automatically
    ▼
Bot 3 — Evaluator
    │  scores the answer: isCorrect / confidence / reasoning
    ▼
Results displayed (green = correct, red = incorrect)
```

---

## Persona options

Both Bot 1 and Bot 2 have configurable personas. Click the **Persona** button on each result box to configure them, or enable **Randomise on each run** for broad coverage.

**Bot 1 flags** (simulate challenging users): bad language, aggressive language, ESL, depression, self-harm ideation, PCI data, financial advice requests, and more.

**Bot 2 options**: personality (professional/empathetic/friendly…), tone, and response style (concise/detailed/structured/simple).

---

## Exporting results

Open the History panel (clock icon) to:
- Re-load any past test result
- Export as a **Jest test file** (`bot-tests.test.js`) — re-runs every query against your live endpoint
- Export as **JUnit XML** — import into CI dashboards (Jenkins, GitHub Actions, etc.)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot connect to endpoint" | Run `ollama serve` and confirm the URL in Settings |
| "No models found" | Pull a model first: `ollama pull mistral` |
| RAG shows 0 chunks | Check that `.md`/`.json` files are in `knowledge/` and click Re-index |
| RAG error: embedding failed | Run `ollama pull nomic-embed-text` |
| Tests are slow | Switch to a smaller model (e.g. `qwen2:1.5b`); larger models are slower |
| App won't start | Delete `node_modules`, run `npm install`, ensure Node 18+ |

---

## Data & privacy

- All processing is local — no data leaves your machine
- Config saved to Electron user data (`~/Library/Application Support/bot-tester/` on macOS)
- History saved as JSON in the same directory
- RAG embedding cache saved to `knowledge/.rag-cache.json`
