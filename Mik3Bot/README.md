# Mik3Bot

A minimal floating desktop assistant powered by Ollama or any Llama-compatible API.

## What it does

- Floating, always-on-top overlay window with drag support
- Multi-turn conversation memory — follow-up questions retain context from earlier in the thread
- RAG (retrieval-augmented generation) from a local knowledge folder
- Optional Knowbase folder integration for richer context
- Optional WebAgent integration for live web search context
- Markdown rendering for responses
- Star responses to save them as Markdown notes
- Query history saved locally
- Global toggle shortcut: `Cmd/Ctrl + Shift + Space`

## Installation

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

Produces platform packages via `electron-builder` using the config in `package.json`.

## Usage

| Action | How |
|---|---|
| Submit prompt | Type and press **Enter** |
| Follow-up question | Type and press **Enter** — the model remembers the conversation |
| Start a new conversation | Click **↺ new** (appears after the first exchange) |
| Close response panel | Press **Escape** |
| Hide window | Click the yellow dot, or `Cmd/Ctrl + Shift + Space` |
| Quit | Click the red dot |
| Open settings | Click **⚙ config** |
| Save a response | Click **☆** on any response |

## Conversation memory

Each session maintains a conversation thread in memory. The full exchange is sent to the model on every turn, so follow-up questions work naturally:

```
You:     Who wrote Hamlet?
Bot:     William Shakespeare.

You:     When was it written?
Bot:     Around 1600–1601.        ← knows "it" means Hamlet
```

The thread persists until you click **↺ new** or restart the app. The turn count is shown next to **↺ new** so you always know the context depth.

RAG and web context are refreshed on every turn using the latest message, so new questions pull in the most relevant knowledge even mid-conversation.

## Settings

Click **⚙ config** to open the settings panel.

| Setting | Description |
|---|---|
| `endpoint` | Base URL for the `/api/chat` request |
| `model` | Model name sent in requests |
| `api key` | Optional bearer token for remote endpoints |
| `render markdown` | Toggle markdown rendering in responses |
| `store history` | Enable or disable local history saving |
| `knowledge` | Built-in RAG knowledge folder |
| `knowbase` | External folder to include in RAG context (e.g. your Knowbase notes) |
| `webagent` | URL of a running WebAgent instance for live web search |

## Defaults

| Setting | Default |
|---|---|
| `endpoint` | `http://localhost:11434` |
| `model` | `gemma4:latest` |
| `apiKey` | *(blank)* |
| `renderMarkdown` | `true` |
| `storeHistory` | `true` |

## RAG (knowledge base)

Mik3Bot indexes Markdown files from the knowledge folder and retrieves relevant chunks to include as context alongside your prompt. To update the index after adding files, click **re-index** in the settings panel.

You can also point it at your Knowbase folder to query those notes directly.

## History

When `storeHistory` is enabled, each prompt-response pair is appended to `history.json` in the Electron user data directory. Each entry contains:

- `timestamp`
- `query`
- `response`
- `model`

Click **show in Finder** in the settings panel to locate the file.

## Starred responses

Click **☆** on any response to save it as a Markdown file in the `Starred/` subfolder of your knowledge or Knowbase directory. Saved files are named by date and prompt.

## Requirements

- Node.js 18+
- Ollama running locally, or any OpenAI-compatible `/api/chat` endpoint
