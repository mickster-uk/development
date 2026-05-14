# Mik3Bot

A minimal floating desktop assistant for the Llama API / Ollama API.

## What it does

- Opens a frameless, always-on-top floating window.
- Sends user prompts to a local or remote Llama-compatible `/api/chat` endpoint.
- Saves configuration in Electron user data.
- Stores query history locally when enabled.
- Supports markdown rendering for responses.
- Offers a global toggle shortcut: `Cmd/Ctrl + Shift + Space`.

## Features

- Floating overlay window with drag support.
- Persistent settings stored in `config.json` inside Electron app data.
- Local history storage in `history.json` when `storeHistory` is enabled.
- API fallback parsing for Ollama, OpenAI-compatible, and Llama API responses.
- Response copy button and elapsed time display.
- Configurable endpoint, model, and API key.

## Defaults

The app uses these defaults when no saved config exists:

- `endpoint`: `http://localhost:11434`
- `model`: `gemma4:latest`
- `apiKey`: `` (blank)
- `renderMarkdown`: `true`
- `storeHistory`: `true`

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

## Configuration

Click **⚙ config** in the app to open settings.

You can configure:

- `endpoint` — the base URL for the `/api/chat` request.
- `model` — the model name to send in requests.
- `apiKey` — optional bearer token for remote endpoints.
- `renderMarkdown` — toggle markdown rendering in responses.
- `storeHistory` — enable or disable local history saving.

## History storage

When enabled, each successful prompt-response pair is appended to `history.json` in the Electron user data directory.

Each history entry includes:

- `timestamp`
- `query`
- `response`
- `model`

## Usage

- Type your prompt in the input field.
- Press **Enter** to submit.
- Press **Escape** to close the response panel.
- Click the yellow dot to hide the window.
- Click the red dot to quit the app.
- Use `Cmd/Ctrl + Shift + Space` to show or hide the window.

## Build

```bash
npm run build
```

This uses `electron-builder` and produces platform packages configured in `package.json`.

## Notes

- The app uses Electron IPC to bridge the renderer and main process.
- Config and history files are stored in the app's `userData` path.
- If the endpoint connection is refused, the app reports a connection error.

## Requirements

- Node.js
- npm
- Electron-compatible environment
