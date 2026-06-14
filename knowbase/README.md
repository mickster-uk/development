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

## Project structure

```
knowbase/
├── main.js          # Electron main process (window, IPC, filesystem, HTTP server)
├── preload.js       # Context bridge (markdown parsing, highlight.js, marked extensions)
├── lib/
│   └── utils.js     # Shared filesystem and bookmark utilities
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
