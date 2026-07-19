# Knowbase

A polished Electron side-panel app for reading and editing Markdown files. Slides in from the right edge of your screen and mirrors your folder's directory structure as a navigable tree.

## Features

| Feature | Detail |
|---|---|
| **Side-panel popup** | Slides in/out from the right edge with a smooth easing animation |
| **Directory tree** | Reads your folder's sub-directory structure for the sidebar |
| **Full Markdown** | GFM support — tables, task lists, code fences, blockquotes, footnotes |
| **Mermaid diagrams** | Renders `mermaid` fenced code blocks as interactive diagrams |
| **Syntax highlighting** | 190+ languages via highlight.js |
| **Dark & Light mode** | Follows system preference; toggle in the title bar |
| **macOS vibrancy** | Frosted-glass blur effect on macOS |
| **Window / Panel mode** | Toggle between a normal OS window and a docked side panel via the toolbar button |
| **Resizable panel** | Drag any edge or corner; double-click the title bar to zoom |
| **Resizable sidebar** | Drag the divider between sidebar and content |
| **Pin on top** | Keep the panel above other windows |
| **Copy buttons** | One-click copy on every code block and inline snippet |
| **External links** | Opens in your default browser |
| **Internal links** | Follows relative `.md` links within the same folder |
| **File editing** | Edit any `.md` or `.json` file in-panel with live preview |
| **New file / folder** | Create files and folders directly from the sidebar |
| **Refresh** | Reload the current folder to pick up files added externally |
| **Chrome Reading List** | Import your Chrome/Brave/Edge reading list or any bookmarks folder as Markdown |
| **Voice dictation** | Speak into your mic and have the transcript appended to the note (ElevenLabs) |
| **Read aloud** | Have the current note (or your text selection) read back to you (ElevenLabs or Inworld) |
| **Persistent state** | Remembers last folder, panel width, theme, sidebar width |

## Getting started

```bash
npm install
npm start
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧M` / `Ctrl+Shift+M` | Toggle the panel (global, works when app is hidden) |
| `Esc` | Hide the panel |
| `⌘\` / `Ctrl+\` | Toggle the file-tree sidebar |
| `⌘O` / `Ctrl+O` | Open a folder |
| `⌘N` / `Ctrl+N` | New file in the current folder |
| `⌘E` / `Ctrl+E` | Toggle edit / preview mode |
| `⌘S` / `Ctrl+S` | Save the current file |

## Window modes

Knowbase has two window modes, toggled with the two-pane icon in the title bar (next to the screen-switch button).

| Mode | Behaviour |
|---|---|
| **Window** (default) | A normal OS window — movable, resizable, native traffic lights on macOS (`hiddenInset`, supports fullscreen/tiling) or the standard frame on Windows (supports Snap). The title bar is a drag region. Bounds (position and size) are remembered across restarts. The collapse-to-tab button and left-edge drag-resizer are hidden. |
| **Panel** | The original behaviour — a frameless, frosted panel docked to the right edge of the screen, with collapse-to-tab, edge drag-resize, and a slide in/out animation. |

**Existing installs default to Window mode on their next launch** — this is a change from the previous panel-only behaviour. Switch back to Panel mode at any time via the toolbar button; the choice is saved and persists across restarts.

Sending the app to a different screen (the display-picker button) works in both modes: in Panel mode it docks to the target display's right edge as before; in Window mode it moves the window to the centre of the target display, keeping its current size.

## Reading List import

Knowbase can import your browser's Reading List (or any bookmarks folder) as a Markdown file. Two methods are supported.

### Method 1 — Bookmarks import button (built-in, no extension needed)

1. Open a folder in Knowbase.
2. Click the **bookmarks icon** (📑) in the title bar.
3. A dropdown lists every bookmarks folder Knowbase found, including Chrome's built-in **Reading list** entry.
4. Select the folder you want. Knowbase saves it as a `.md` file inside a subfolder named after the bookmarks folder, within your current Knowbase folder.

Supported browsers (macOS): **Chrome**, Chrome Beta, Chrome Dev, Chrome Canary, Chromium, **Brave**, **Microsoft Edge**.

> The browser does not need to be open — Knowbase reads the bookmarks file directly from disk.

### Method 2 — Chrome extension (live push)

Knowbase runs a local HTTP server on **port 57420** that a companion Chrome extension can POST reading list items to.

The extension sends a `POST` request to:

```
http://127.0.0.1:57420/reading-list
```

with a JSON body:

```json
{ "items": [ { "title": "Page title", "url": "https://...", "creationTime": 1234567890 } ] }
```

When items arrive, Knowbase saves them as a Markdown table to:

```
<your-knowbase-folder>/Reading List/Reading List.md
```

The file is created or overwritten each time items are received, then opened automatically in the panel.

> You must have a folder open in Knowbase before the extension sends items, otherwise an error is shown.

## Voice (dictation & read-aloud)

Knowbase can turn speech into notes and notes into speech. Dictation (speech-to-text) always uses [ElevenLabs](https://elevenlabs.io). Read aloud (text-to-speech) can use either **ElevenLabs** or **[Inworld](https://inworld.ai)**, picked via a provider dropdown.

### Setup

1. Click the **gear icon** (⚙) in the title bar to open Voice settings.
2. Choose a **Read aloud voice** provider — ElevenLabs or Inworld.
3. Paste your ElevenLabs API key (required for Dictate always, and for Read aloud if ElevenLabs is selected). Optionally set a Voice ID — leave blank to use the default (`bIHbv24MWmeRgasZH58o`).
4. If Inworld is selected for Read aloud, paste your Inworld API key and optionally a Voice ID — leave blank to use the default (`Luna`).

> **Free-tier note:** ElevenLabs' free API tier rejects "library" voices (community-shared voices, even ones added to your own account) with a 402 `payment_required` error — only `premade` default voices or your own cloned voices work. The built-in default (`bIHbv24MWmeRgasZH58o`) is a confirmed-working `premade` voice. Don't swap it for a library voice ID unless you're on a paid plan.

> **Inworld** is TTS-only here — there's no speech-to-text call, so Dictate always uses ElevenLabs regardless of which provider is selected for Read aloud. The TTS request uses model `inworld-tts-2`, non-streaming `BALANCED` delivery mode, language `en-US`, and speaking rate `1` — these are fixed and not exposed in the UI.

### Dictate (🎤)

Available in the per-file toolbar when editing a Markdown file (hidden for JSON and in preview mode). Click to start recording, click again to stop. The recording is transcribed and the transcript is **always appended to the end of the note** — not inserted at the cursor. Always uses ElevenLabs.

### Read aloud (🔊)

Available in the per-file toolbar in both view and edit mode (hidden for JSON files). Reads your current **text selection if one exists, otherwise the whole note**. In edit mode, Markdown syntax is stripped before sending to speech. Uses whichever provider (ElevenLabs or Inworld) is selected in Voice settings.

Status (recording / transcribing / errors) shows briefly in the status bar and clears after a few seconds.

## Project structure

```
knowbase/
├── main.js          # Electron main process (window, IPC, filesystem, HTTP server)
├── preload.js       # Context bridge (markdown parsing, highlight.js, marked extensions)
├── lib/
│   ├── utils.js             # Shared filesystem and bookmark utilities
│   └── stream-to-buffer.js  # Buffers ElevenLabs SDK streams (WHATWG or async-iterable)
└── renderer/
    ├── index.html   # App shell
    ├── css/
    │   ├── app.css       # Layout, theme variables, sidebar
    │   └── markdown.css  # GitHub-style markdown rendering
    └── js/
        └── app.js        # All UI logic
```

## Supported Markdown extensions

`.md` `.markdown` `.mdown` `.mkd` `.mkdn` `.mdwn` `.mdtxt` `.mdtext` `.txt`
