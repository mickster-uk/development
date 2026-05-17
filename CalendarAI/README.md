# CalendarAI

A desktop app that shows your Google Calendar events as a year-plan timeline and lets you search and ask questions about them using local Ollama AI models.

Built with Electron, matching the style of BotTester and Mik3Bot.

---

## Features

- **Year timeline** — all 12 months laid out with every event, expandable rows showing location, description, and attendees
- **Year navigation** — jump between years with the arrow controls in the titlebar
- **AI search** — ask natural language questions about your calendar; RAG retrieves the most relevant events and an Ollama LLM answers
- **Highlighted results** — matched events are highlighted in the timeline after a search
- **Local & private** — everything runs on your machine; no data leaves except the OAuth handshake with Google

---

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Ollama](https://ollama.com) running locally with:
  - An embedding model: `ollama pull nomic-embed-text`
  - A chat model, e.g.: `ollama pull llama3.2`
- A Google Cloud project with the Calendar API enabled (see setup below)

---

## Google Cloud Setup

You only need to do this once.

### 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Give it a name (e.g. `CalendarAI`) and click **Create**

### 2. Enable the Google Calendar API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Calendar API** and click **Enable**

### 3. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. If prompted to configure the consent screen first:
   - Choose **External**
   - Fill in the app name (anything) and your email
   - On the **Test users** step, add your Gmail address
   - Save and continue through the remaining steps
4. Back on Create credentials, choose **Desktop app** as the application type
5. Give it a name and click **Create**
6. Under **Authorised Redirect URIs**, add: `http://127.0.0.1`
7. Copy the **Client ID** and **Client Secret** — you'll paste these into the app

---

## Installation

```bash
cd CalendarAI
npm install
npm start
```

---

## First Launch

1. The app opens to a setup screen
2. Paste your **Client ID** and **Client Secret** into the fields
3. Click **Connect to Google Calendar**
4. Your browser opens a Google authorisation page — sign in and approve access
5. Return to the app — your calendar events load automatically

Settings (credentials, Ollama endpoint, model) can be changed at any time via the **⚙** button in the titlebar.

---

## Using AI Search

Once events are loaded, CalendarAI indexes them in the background using Ollama embeddings. The search bar shows the indexing progress (`Indexing 45%` → `120 indexed`).

When indexing is complete, type a question and press **Search** or **Enter**:

- *"What meetings do I have in March?"*
- *"Summarise my Q2 schedule"*
- *"When is my next team standup?"*
- *"Do I have anything on Friday afternoons?"*

Relevant events are highlighted in the timeline and an AI-generated answer appears in the panel at the bottom.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| Client ID | — | Google OAuth Client ID |
| Client Secret | — | Google OAuth Client Secret |
| Ollama Endpoint | `http://localhost:11434` | URL of your Ollama instance |
| Model | `llama3.2:latest` | Chat model used for AI answers |

The embedding model is always `nomic-embed-text`. Make sure it is pulled in Ollama before using search.

---

## Troubleshooting

**"Embedding failed — is nomic-embed-text pulled in Ollama?"**
Run `ollama pull nomic-embed-text` in your terminal.

**"Cannot connect to http://localhost:11434"**
Make sure Ollama is running (`ollama serve`).

**Authentication fails or browser doesn't open**
Check that `http://127.0.0.1` is listed under Authorised Redirect URIs in your Google Cloud credentials, and that your Google account is added as a Test User on the OAuth consent screen.

**Events not loading after sign-in**
Try signing out via ⚙ → Sign Out, then reconnecting. If the error persists, your access token may have expired — re-authorising will issue a fresh one.
