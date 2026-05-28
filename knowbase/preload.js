const { contextBridge, ipcRenderer } = require('electron');
const { marked }  = require('marked');
const hljs        = require('highlight.js');

// ─── Configure marked ─────────────────────────────────────────────────────────
marked.setOptions({ gfm: true, breaks: true });

marked.use({
  renderer: {
    // Syntax-highlighted code blocks (mermaid gets a special wrapper)
    code(code, infostring) {
      const lang = (infostring || '').match(/^\S*/)?.[0] || '';

      // Mermaid diagrams – rendered in the renderer via mermaid.js
      if (lang === 'mermaid') {
        return `<div class="mermaid-wrap" data-code="${encodeURIComponent(code)}">` +
               `<div class="mermaid-loading">Rendering diagram…</div>` +
               `</div>`;
      }

      const validLng = lang && hljs.getLanguage(lang) ? lang : null;
      let highlighted;
      try {
        highlighted = validLng
          ? hljs.highlight(code, { language: validLng }).value
          : hljs.highlightAuto(code).value;
      } catch (_) {
        highlighted = escapeHtml(code);
      }
      const cls = validLng ? ` language-${validLng}` : '';
      return `<div class="code-block-wrap">` +
             `<button class="copy-btn" data-code="${encodeURIComponent(code)}" title="Copy">` +
             `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
             `</button>` +
             `<pre><code class="hljs${cls}">${highlighted}</code></pre>` +
             `</div>`;
    },

    // Open external links in system browser, internal links in-panel
    link(href, title, text) {
      if (!href) return text;
      const isExt = /^https?:\/\//.test(href);
      const t     = title ? ` title="${title}"` : '';
      if (isExt) {
        return `<a href="#" class="ext-link" data-url="${href}"${t}>${text} <svg class="ext-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
      }
      return `<a href="#" class="int-link" data-href="${href}"${t}>${text}</a>`;
    },

    // Anchor-linked headings
    heading(text, level) {
      const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}">#</a>${text}</h${level}>`;
    },

    // Checkbox task lists
    listitem(text, task, checked) {
      if (task) {
        return `<li class="task-item"><input type="checkbox" disabled${checked ? ' checked' : ''}> ${text}</li>`;
      }
      return `<li>${text}</li>`;
    }
  }
});

// ─── Info panel extension  :::inf [colour] … ::: ──────────────────────────────
marked.use({
  extensions: [{
    name: 'infopanel',
    level: 'block',
    start(src) { return src.indexOf(':::inf'); },
    tokenizer(src) {
      const match = /^:::inf(?:\s+(blue|green|yellow|red|purple))?\s*\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/.exec(src);
      if (match) {
        const token = {
          type:   'infopanel',
          raw:    match[0],
          color:  (match[1] || 'blue').toLowerCase(),
          text:   match[2],
          tokens: []
        };
        this.lexer.blockTokens(token.text, token.tokens);
        return token;
      }
    },
    renderer(token) {
      const icons = { blue: 'ℹ', green: '✓', yellow: '⚠', red: '✕', purple: '★' };
      const icon  = icons[token.color] || 'ℹ';
      const body  = this.parser.parse(token.tokens);
      return `<div class="inf-panel inf-panel-${token.color}">` +
             `<span class="inf-panel-icon" aria-hidden="true">${icon}</span>` +
             `<div class="inf-panel-body">${body}</div>` +
             `</div>\n`;
    }
  }]
});

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Context bridge ───────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('api', {
  // File system – read
  readDirectory:    (p)          => ipcRenderer.invoke('read-directory', p),
  readFile:         (p)          => ipcRenderer.invoke('read-file', p),
  openFolderDialog: ()           => ipcRenderer.invoke('open-folder-dialog'),

  // File system – write / create / manage
  writeFile:    (filePath, content)  => ipcRenderer.invoke('write-file', filePath, content),
  createFile:   (filePath)           => ipcRenderer.invoke('create-file', filePath),
  createFolder: (folderPath)         => ipcRenderer.invoke('create-folder', folderPath),
  deleteFile:   (filePath)           => ipcRenderer.invoke('delete-file', filePath),
  renameFile:   (oldPath, newPath)   => ipcRenderer.invoke('rename-file', oldPath, newPath),

  // Config
  getConfig:  ()    => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  // Window / panel
  togglePanel:    ()    => ipcRenderer.invoke('toggle-panel'),
  hidePanel:      ()    => ipcRenderer.invoke('hide-panel'),
  quitApp:        ()    => ipcRenderer.invoke('quit-app'),
  setAlwaysOnTop: (val) => ipcRenderer.invoke('set-always-on-top', val),
  resizeWindow:   (w)   => ipcRenderer.send('resize-window', w),

  // Multi-display
  getDisplays:    ()    => ipcRenderer.invoke('get-displays'),
  dockToDisplay:  (id)  => ipcRenderer.invoke('dock-to-display', id),

  // External
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getPlatform:  ()    => ipcRenderer.invoke('get-platform'),
  getVersion:   ()    => ipcRenderer.invoke('get-version'),

  // Markdown parsing (runs in Node context)
  parseMarkdown: (md) => marked.parse(md),

  // Events from main
  onRestoreFolder: (cb) => ipcRenderer.on('restore-folder', (_, p) => cb(p)),
});
