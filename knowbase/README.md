# Markdown Reader

A polished Electron side-panel app for reading Markdown files. Slides in from the right edge of your screen and mirrors your folder's directory structure as a navigable tree.

## Features

| Feature | Detail |
|---|---|
| **Side-panel popup** | Slides in/out from the right edge with a smooth easing animation |
| **Directory tree** | Reads your folder's sub-directory structure for the sidebar menu |
| **Full Markdown** | GFM support — tables, task lists, code fences, blockquotes, footnotes |
| **Syntax highlighting** | 190+ languages via highlight.js |
| **Dark & Light mode** | Follows system preference; toggle in the title bar |
| **macOS vibrancy** | Frosted-glass blur effect on macOS |
| **Resizable panel** | Drag the left edge to adjust panel width |
| **Resizable sidebar** | Drag the divider between sidebar and content |
| **Pin on top** | Keep the panel above other windows |
| **Copy buttons** | One-click copy on every code block |
| **External links** | Opens in your default browser |
| **Internal links** | Follows relative `.md` links within the same folder |
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

## Project structure

```
MarkdownReader/
├── main.js          # Electron main process (window, IPC, filesystem)
├── preload.js       # Context bridge (markdown parsing with hljs)
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
