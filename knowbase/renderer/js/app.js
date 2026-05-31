/* ── Knowbase – renderer ──────────────────────────────────────────────────── */
'use strict';

let mermaidCounter = 0;

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  platform:       'darwin',
  isDark:         false,
  isPinned:       false,
  sidebarVisible: true,
  currentFolder:  null,
  currentFile:    null,
  tree:           [],
  sidebarWidth:   220,
  // Editor
  isEditing:      false,
  isDirty:        false,
  editorContent:  '',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
  shell:          $('app-shell'),
  tbTitle:        $('tb-title'),
  btnSidebarToggle: $('btn-sidebar-toggle'),
  btnTheme:       $('btn-theme'),
  iconSun:        $('icon-sun'),
  iconMoon:       $('icon-moon'),
  btnPin:         $('btn-pin'),
  btnImport:      $('btn-import'),
  btnHide:        $('btn-hide'),
  sidebar:        $('sidebar'),
  sidebarResizer: $('sidebar-resizer'),
  fileTree:       $('file-tree'),
  emptyHint:      $('empty-hint'),
  btnOpenFolder:  $('btn-open-folder'),
  btnNewFile:     $('btn-new-file'),
  content:        $('content'),
  welcome:        $('welcome'),
  mdScroll:       $('md-scroll'),
  mdBody:         $('markdown-body'),
  ctBar:          $('ct-bar'),
  ctFile:         $('ct-file'),
  btnEditMode:    $('btn-edit-mode'),
  btnSave:        $('btn-save'),
  btnViewMode:    $('btn-view-mode'),
  editorWrap:     $('editor-wrap'),
  mdEditor:       $('md-editor'),
  statusFile:     $('status-file'),
  statusMeta:     $('status-meta'),
  hlTheme:        $('hljs-theme'),
  kbdShortcut:    $('kbd-shortcut'),
  edgeResize:     $('edge-resize'),
  tbVersion:      $('tb-version'),
  btnDisplay:     $('btn-display'),
  btnCollapse:    $('btn-collapse'),
  panelTab:       $('panel-tab'),
  panelTabIcon:   document.querySelector('.panel-tab-icon-btn'),
  btnExpand:      $('btn-expand'),
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  state.platform = await api.getPlatform();

  if (state.platform === 'darwin') {
    document.documentElement.classList.add('platform-macos');
    el.kbdShortcut.textContent = '⌘⇧M';
  } else {
    el.kbdShortcut.textContent = 'Ctrl+Shift+M';
  }

  // Version badge
  const ver = await api.getVersion();
  if (el.tbVersion) el.tbVersion.textContent = 'v' + ver;

  const cfg = await api.getConfig();

  // Theme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(cfg.dark !== undefined ? cfg.dark : prefersDark, false);

  // Sidebar width
  if (cfg.sidebarWidth) {
    state.sidebarWidth = cfg.sidebarWidth;
    el.sidebar.style.width = state.sidebarWidth + 'px';
  }

  if (cfg.sidebarVisible === false) setSidebarVisible(false, false);
  if (cfg.pinned)                   setPinned(true, false);

  initMermaid();
  bindEvents();

  api.onRestoreFolder(path => loadFolder(path));
  if (cfg.lastFolder) loadFolder(cfg.lastFolder);
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(dark, save = true) {
  state.isDark = dark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

  const base = '../node_modules/highlight.js/styles/';
  el.hlTheme.href = dark ? base + 'github-dark.min.css' : base + 'github.min.css';

  el.iconSun.style.display  = dark ? 'none' : '';
  el.iconMoon.style.display = dark ? ''     : 'none';

  // Re-init mermaid with matching theme and re-render any visible diagrams
  initMermaid();
  if (el.mdScroll.style.display !== 'none' && el.mdBody.querySelector('.mermaid-wrap, .mermaid-diagram')) {
    if (state.editorContent) renderMarkdown(api.parseMarkdown(state.editorContent));
  }

  if (save) api.saveConfig({ dark });
}
function toggleTheme() { applyTheme(!state.isDark); }

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function setSidebarVisible(visible, save = true) {
  state.sidebarVisible = visible;
  if (visible) {
    el.sidebar.classList.remove('collapsed');
    el.sidebar.style.width = state.sidebarWidth + 'px';
  } else {
    el.sidebar.classList.add('collapsed');
  }
  if (save) api.saveConfig({ sidebarVisible: visible });
}
function toggleSidebar() { setSidebarVisible(!state.sidebarVisible); }

// ─── Pin ──────────────────────────────────────────────────────────────────────
function setPinned(pinned, save = true) {
  state.isPinned = pinned;
  el.btnPin.dataset.pinned = String(pinned);
  el.btnPin.title = pinned ? 'Unpin from top' : 'Pin on top';
  api.setAlwaysOnTop(pinned);
  if (save) api.saveConfig({ pinned });
}
function togglePin() { setPinned(!state.isPinned); }

async function showBookmarkFolderPicker(anchorEl) {
  closeBookmarkPicker();

  if (!state.currentFolder) {
    showError('Open a folder before importing bookmarks.');
    return;
  }

  const result = await api.getBookmarksFolders();
  if (!result.success) {
    showError('Could not read bookmarks: ' + result.error);
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'bookmark-picker';
  document.body.appendChild(menu);

  for (const folder of result.folders) {
    const item = document.createElement('button');
    item.className = 'bookmark-picker-item';
    item.textContent = folder.displayPath;
    item.title = folder.displayPath;
    item.addEventListener('mousedown', async e => {
      e.preventDefault();
      closeBookmarkPicker();
      const res = await api.importBookmarksFolder(state.currentFolder, folder.id);
      if (!res.success) { showError('Import failed: ' + res.error); return; }
      await loadFolder(state.currentFolder);
      await openFile(res.filePath);
    });
    menu.appendChild(item);
  }

  const rect = anchorEl.getBoundingClientRect();
  menu.style.top   = (rect.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  const onOutside = e => { if (!menu.contains(e.target)) closeBookmarkPicker(); };
  setTimeout(() => document.addEventListener('click', onOutside, true), 10);
  menu._onOutside = onOutside;
}

function closeBookmarkPicker() {
  const m = document.querySelector('.bookmark-picker');
  if (!m) return;
  if (m._onOutside) document.removeEventListener('click', m._onOutside, true);
  m.remove();
}

// ─── Collapse to tab ──────────────────────────────────────────────────────────
function collapseToTab() {
  el.shell.classList.add('tab-mode');
  api.collapseToTab();
}

function expandFromTab() {
  el.shell.classList.remove('tab-mode');
  api.expandFromTab();
}

// ─── Open folder ─────────────────────────────────────────────────────────────
async function openFolderDialog() {
  const res = await api.openFolderDialog();
  if (res.success) loadFolder(res.folderPath);
}

async function loadFolder(folderPath) {
  state.currentFolder = folderPath;
  const folderName = folderPath.split(/[/\\]/).pop() || folderPath;
  el.tbTitle.textContent = folderName;
  el.btnNewFile.disabled = false;

  const res = await api.readDirectory(folderPath);
  if (!res.success) { showError('Could not read folder: ' + res.error); return; }

  state.tree = res.tree;
  renderFileTree(res.tree, el.fileTree);
  api.saveConfig({ lastFolder: folderPath });
}

// ─── File tree ────────────────────────────────────────────────────────────────
function renderFileTree(tree, container) {
  container.innerHTML = '';
  if (!tree || tree.length === 0) {
    el.emptyHint.style.display = 'flex';
    container.appendChild(el.emptyHint);
    return;
  }
  el.emptyHint.style.display = 'none';
  container.appendChild(buildTreeUL(tree, 0));
}

function buildTreeUL(items, depth) {
  const ul = document.createElement('ul');
  ul.style.cssText = 'list-style:none;padding:0;margin:0;';
  for (const item of items) ul.appendChild(buildTreeItem(item, depth));
  return ul;
}

function buildTreeItem(item, depth) {
  const li = document.createElement('li');

  if (item.type === 'directory') {
    li.className = 'tree-dir';

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (6 + depth * 14) + 'px';

    row.appendChild(svgIcon(`<polyline points="9,6 15,12 9,18"/>`, 'tree-caret'));
    row.appendChild(svgIcon(`<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`, null, '#facc15'));

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;
    row.appendChild(label);

    // "+ new file" button (visible on row hover)
    const newBtn = document.createElement('button');
    newBtn.className = 'new-in-dir-btn';
    newBtn.title = 'New file here';
    newBtn.appendChild(svgIcon(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`));
    row.appendChild(newBtn);

    li.appendChild(row);

    const children = buildTreeUL(item.children || [], depth + 1);
    children.setAttribute('class', 'tree-children');
    li.appendChild(children);

    row.addEventListener('click', e => {
      if (e.target.closest('.new-in-dir-btn')) return;
      li.classList.toggle('open');
    });

    newBtn.addEventListener('click', e => {
      e.stopPropagation();
      li.classList.add('open');
      showNewItemMenu(newBtn, item.path, depth + 1, () => children);
    });

  } else {
    li.className = 'tree-file';
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (6 + depth * 14 + 12) + 'px';
    row.dataset.path = item.path;

    row.appendChild(svgIcon(fileIconPath(item.name), null, 'var(--text-accent)'));

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;
    row.appendChild(label);

    li.appendChild(row);

    row.addEventListener('click', () => {
      // Warn about unsaved changes
      if (state.isDirty && !confirm('You have unsaved changes. Discard and open this file?')) return;
      document.querySelectorAll('.tree-row.active').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      openFile(item.path);
    });

    if (state.currentFile === item.path) row.classList.add('active');
  }

  return li;
}

// ─── New-item dropdown menu ───────────────────────────────────────────────────
function showNewItemMenu(anchorEl, dirPath, depth, getUL) {
  closeNewItemMenu();

  const menu = document.createElement('div');
  menu.className = 'new-item-menu';
  document.body.appendChild(menu);

  function makeMenuItem(pathData, color, label, type) {
    const btn = document.createElement('button');
    btn.className = 'new-item-menu-btn';
    const ico = svgIcon(pathData, null, color);
    ico.style.cssText = 'width:14px;height:14px;flex-shrink:0';
    btn.appendChild(ico);
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      closeNewItemMenu();
      const ul = getUL();
      showInlineNewInput(ul, dirPath, depth, type);
    });
    return btn;
  }

  menu.appendChild(makeMenuItem(
    `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>`,
    'var(--text-accent)', 'New File', 'file'
  ));
  menu.appendChild(makeMenuItem(
    `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`,
    '#facc15', 'New Folder', 'folder'
  ));

  // Position below the anchor button
  const rect = anchorEl.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';

  // Close on outside click
  const onOutside = e => { if (!menu.contains(e.target)) closeNewItemMenu(); };
  setTimeout(() => document.addEventListener('click', onOutside, true), 10);
  menu._onOutside = onOutside;
}

function closeNewItemMenu() {
  const m = document.querySelector('.new-item-menu');
  if (!m) return;
  if (m._onOutside) document.removeEventListener('click', m._onOutside, true);
  m.remove();
}

// ─── Inline new-item input (file or folder) ───────────────────────────────────
function showInlineNewInput(childrenUL, dirPath, depth, type = 'file') {
  if (!childrenUL) return;
  if (childrenUL.querySelector('.new-file-input-row')) return;

  const isFolder = type === 'folder';

  const row = document.createElement('div');
  row.className = 'new-file-input-row';
  row.style.paddingLeft = (6 + depth * 14 + 12) + 'px';

  const icon = isFolder
    ? svgIcon(`<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`, null, '#facc15')
    : svgIcon(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>`, null, 'var(--text-accent)');
  icon.style.cssText = 'width:14px;height:14px;flex-shrink:0';
  row.appendChild(icon);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'new-file-input';
  input.placeholder = isFolder ? 'folder-name' : 'filename.md';
  row.appendChild(input);

  childrenUL.insertBefore(row, childrenUL.firstChild);
  input.focus();

  async function confirmCreate() {
    let name = input.value.trim();
    if (!name) { row.remove(); return; }
    if (!isFolder && !/\.\w+$/.test(name)) name += '.md';
    const sep   = dirPath.includes('\\') ? '\\' : '/';
    const fpath = dirPath.replace(/[/\\]+$/, '') + sep + name;
    row.remove();

    if (isFolder) {
      const res = await api.createFolder(fpath);
      if (res.success) {
        await loadFolder(state.currentFolder);
      } else {
        showError('Could not create folder: ' + res.error);
      }
    } else {
      const res = await api.createFile(fpath);
      if (res.success) {
        await loadFolder(state.currentFolder);
        await openFile(fpath);
        enterEditMode();
      } else {
        showError('Could not create file: ' + res.error);
      }
    }
  }

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter')  confirmCreate();
    if (e.key === 'Escape') row.remove();
  });
  input.addEventListener('blur', () => setTimeout(() => { if (row.parentNode) row.remove(); }, 200));
}

// Top-bar + button — show dropdown
function newItemAtRoot() {
  if (!state.currentFolder) return;
  showNewItemMenu(el.btnNewFile, state.currentFolder, 0, () => {
    let ul = el.fileTree.querySelector('ul');
    if (!ul) {
      el.fileTree.innerHTML = '';
      ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;';
      el.fileTree.appendChild(ul);
    }
    return ul;
  });
}

// ─── Open & render file ───────────────────────────────────────────────────────
async function openFile(filePath) {
  if (state.isEditing) enterViewMode(false);   // exit edit without saving
  state.currentFile    = filePath;
  state.isDirty        = false;

  const res = await api.readFile(filePath);
  if (!res.success) { showError('Could not read file: ' + res.error); return; }

  state.editorContent  = res.content;

  renderMarkdown(api.parseMarkdown(res.content));
  updateStatusBar(res);
  updateCtBar();
}

function renderMarkdown(html) {
  el.welcome.style.display  = 'none';
  el.mdScroll.style.display = '';
  el.mdBody.innerHTML       = html;

  renderMermaidDiagrams();

  // Copy buttons for code blocks
  el.mdBody.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = decodeURIComponent(btn.dataset.code || '');
      try {
        await navigator.clipboard.writeText(code);
        btn.classList.add('copied');
        btn.title = 'Copied!';
        setTimeout(() => { btn.classList.remove('copied'); btn.title = 'Copy'; }, 1800);
      } catch (_) {}
    });
  });

  // Copy buttons for inline code
  el.mdBody.querySelectorAll('.inline-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const code = decodeURIComponent(btn.dataset.code || '');
      try {
        await navigator.clipboard.writeText(code);
        btn.classList.add('copied');
        const originalTitle = btn.title;
        btn.title = 'Copied!';
        setTimeout(() => { btn.classList.remove('copied'); btn.title = originalTitle; }, 1800);
      } catch (_) {}
    });
  });

  // External links
  el.mdBody.querySelectorAll('a.ext-link').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); api.openExternal(a.dataset.url); });
  });

  // Internal / relative links
  el.mdBody.querySelectorAll('a.int-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const href = a.dataset.href;
      if (!href) return;
      if (href.startsWith('#')) {
        const target = el.mdBody.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (state.currentFile) {
        const dir      = state.currentFile.replace(/[/\\][^/\\]+$/, '');
        const resolved = dir + '/' + href;
        openFile(resolved);
      }
    });
  });

  el.mdScroll.scrollTop = 0;
}

// ─── Edit mode ────────────────────────────────────────────────────────────────
function enterEditMode() {
  state.isEditing = true;

  el.mdScroll.style.display   = 'none';
  el.editorWrap.style.display = '';
  el.mdEditor.value           = state.editorContent;
  el.mdEditor.focus();

  el.btnEditMode.style.display  = 'none';
  el.btnSave.style.display      = '';
  el.btnViewMode.style.display  = '';

  updateCtBar();
  setupEditorTabKey();
}

function enterViewMode(andSave = false) {
  if (andSave && state.isDirty) saveCurrentFile();

  // Sync content back
  if (state.isEditing) state.editorContent = el.mdEditor.value;

  state.isEditing = false;

  // Re-render if content changed
  renderMarkdown(api.parseMarkdown(state.editorContent));

  el.editorWrap.style.display = 'none';
  el.mdScroll.style.display   = '';

  el.btnEditMode.style.display  = '';
  el.btnSave.style.display      = 'none';
  el.btnViewMode.style.display  = 'none';

  setDirty(false);
  updateCtBar();
}

function toggleEditView() {
  state.isEditing ? enterViewMode(false) : enterEditMode();
}

async function saveCurrentFile() {
  if (!state.currentFile) return;
  const content = el.mdEditor.value;
  const res     = await api.writeFile(state.currentFile, content);
  if (res.success) {
    state.editorContent = content;
    setDirty(false);
    updateStatusBar({ filePath: state.currentFile, size: res.size, modified: res.modified });
  } else {
    showError('Save failed: ' + res.error);
  }
}

function setDirty(dirty) {
  state.isDirty = dirty;
  el.ctFile.classList.toggle('dirty', dirty);
}

function updateCtBar() {
  if (!state.currentFile) { el.ctBar.style.display = 'none'; return; }
  el.ctBar.style.display = '';
  const name = state.currentFile.split(/[/\\]/).pop();
  el.ctFile.textContent  = name;
  el.ctFile.classList.toggle('dirty', state.isDirty);
}

// ─── Mermaid ──────────────────────────────────────────────────────────────────
function initMermaid() {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({
    startOnLoad:   false,
    theme:         state.isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily:    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  });
}

async function renderMermaidDiagrams() {
  if (typeof mermaid === 'undefined') return;

  // Clean up any document-level drag listeners from a previous render
  if (renderMermaidDiagrams._cleanups) {
    renderMermaidDiagrams._cleanups.forEach(fn => fn());
  }
  renderMermaidDiagrams._cleanups = [];

  const wraps = el.mdBody.querySelectorAll('.mermaid-wrap');
  for (const wrap of wraps) {
    const code = decodeURIComponent(wrap.dataset.code || '');
    if (!code) continue;
    const id = 'mermaid-' + (++mermaidCounter);
    try {
      const { svg } = await mermaid.render(id, code);

      // ── Build DOM structure ──────────────────────────────────
      const diagram = document.createElement('div');
      diagram.className = 'mermaid-diagram';

      const canvas = document.createElement('div');
      canvas.className = 'mermaid-canvas';
      canvas.innerHTML = svg;
      diagram.appendChild(canvas);

      // Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';

      const mkBtn = (title, svgHTML, extraClass = '') => {
        const b = document.createElement('button');
        b.className = 'mermaid-zoom-btn' + (extraClass ? ' ' + extraClass : '');
        b.title = title;
        b.innerHTML = svgHTML;
        return b;
      };
      const ICON_ZOOM_OUT = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
      const ICON_ZOOM_IN  = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
      const ICON_FIT      = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;

      const zoomOut   = mkBtn('Zoom out (−)',    ICON_ZOOM_OUT);
      const zoomLabel = document.createElement('span');
      zoomLabel.className = 'mermaid-zoom-label';
      const zoomIn    = mkBtn('Zoom in (+)',     ICON_ZOOM_IN);
      const fitBtn    = mkBtn('Fit to view',     ICON_FIT, 'mermaid-zoom-reset');

      toolbar.append(zoomOut, zoomLabel, zoomIn, fitBtn);
      diagram.appendChild(toolbar);
      wrap.innerHTML = '';
      wrap.appendChild(diagram);

      // ── SVG natural size from viewBox ────────────────────────
      const svgEl = canvas.querySelector('svg');
      if (!svgEl) continue;

      const vb       = svgEl.viewBox.baseVal;
      const naturalW = vb.width  > 0 ? vb.width  : (parseFloat(svgEl.style.maxWidth) || 500);
      const naturalH = vb.height > 0 ? vb.height : 300;

      // Remove mermaid's inline constraints; make SVG absolutely positioned
      svgEl.removeAttribute('style');
      svgEl.style.position       = 'absolute';
      svgEl.style.top            = '0';
      svgEl.style.left           = '0';
      svgEl.style.width          = naturalW + 'px';
      svgEl.style.height         = naturalH + 'px';
      svgEl.style.maxWidth       = 'none';
      svgEl.style.transformOrigin = '0 0';

      // ── Viewport: fits diagram width, caps height ────────────
      const containerW = wrap.offsetWidth - 2;   // subtract border
      const fitScale   = Math.min(1, containerW / naturalW);
      const canvasH    = Math.min(440, Math.max(150, Math.round(naturalH * fitScale) + 20));

      canvas.style.position   = 'relative';
      canvas.style.height     = canvasH + 'px';
      canvas.style.overflow   = 'hidden';
      canvas.style.cursor     = 'grab';
      canvas.style.userSelect = 'none';

      // ── Pan / zoom state ─────────────────────────────────────
      let scale = fitScale;
      let tx    = Math.round((containerW - naturalW * fitScale) / 2);
      let ty    = Math.round(Math.max(10, (canvasH - naturalH * fitScale) / 2));

      function commit() {
        svgEl.style.transform  = `translate(${tx}px,${ty}px) scale(${scale})`;
        zoomLabel.textContent  = Math.round(scale * 100) + '%';
      }

      function zoomTo(newScale, pivotX, pivotY) {
        const old = scale;
        scale = Math.max(0.08, Math.min(8, newScale));
        if (pivotX !== undefined) {
          tx = pivotX - (pivotX - tx) * (scale / old);
          ty = pivotY - (pivotY - ty) * (scale / old);
        }
        commit();
      }

      function resetFit() {
        scale = fitScale;
        tx    = Math.round((canvas.clientWidth  - naturalW * fitScale) / 2);
        ty    = Math.round(Math.max(10, (canvas.clientHeight - naturalH * fitScale) / 2));
        commit();
      }

      // ── Drag / pan ───────────────────────────────────────────
      let dragging = false, ox = 0, oy = 0;

      canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        dragging = true;
        ox = e.clientX - tx;
        oy = e.clientY - ty;
        canvas.classList.add('dragging');
        e.preventDefault();
      });

      const onMove = e => {
        if (!dragging) return;
        tx = e.clientX - ox;
        ty = e.clientY - oy;
        commit();
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        canvas.classList.remove('dragging');
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
      renderMermaidDiagrams._cleanups.push(() => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      });

      // ── Mouse-wheel zoom (zoom toward cursor) ────────────────
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const rect   = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        zoomTo(scale * (e.deltaY < 0 ? 1.1 : 0.9), mouseX, mouseY);
      }, { passive: false });

      // ── Toolbar buttons ──────────────────────────────────────
      zoomIn.addEventListener('click',  () => zoomTo(scale * 1.3, canvas.clientWidth / 2, canvas.clientHeight / 2));
      zoomOut.addEventListener('click', () => zoomTo(scale / 1.3, canvas.clientWidth / 2, canvas.clientHeight / 2));
      fitBtn.addEventListener('click',  resetFit);

      commit();
    } catch (e) {
      wrap.innerHTML =
        `<div class="mermaid-error">` +
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
        `<span>Diagram error: ${escapeHtml(e.message)}</span></div>`;
    }
  }
}

// ─── Display picker ───────────────────────────────────────────────────────────
async function showDisplayPicker(anchorEl) {
  closeDisplayPicker();

  const displays = await api.getDisplays();
  if (displays.length <= 1) return; // no point showing if only one screen

  const menu = document.createElement('div');
  menu.className = 'display-picker';
  document.body.appendChild(menu);

  for (const d of displays) {
    const item = document.createElement('button');
    item.className = 'display-picker-item' + (d.isActive ? ' active' : '');

    const icon = svgIcon(
      `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`,
      null, d.isActive ? 'var(--text-accent)' : 'var(--text-muted)'
    );
    icon.style.cssText = 'width:15px;height:15px;flex-shrink:0';

    const info = document.createElement('div');
    info.className = 'display-picker-info';
    info.innerHTML =
      `<span class="display-picker-name">Screen ${d.index}${d.isPrimary ? ' <em>Primary</em>' : ''}</span>` +
      `<span class="display-picker-size">${d.width} × ${d.height}</span>`;

    if (d.isActive) {
      const dot = document.createElement('span');
      dot.className = 'display-picker-dot';
      dot.textContent = '●';
      item.appendChild(dot);
    }

    item.prepend(icon);
    item.appendChild(info);

    item.addEventListener('mousedown', async e => {
      e.preventDefault();
      closeDisplayPicker();
      await api.dockToDisplay(d.id);
    });
    menu.appendChild(item);
  }

  const rect  = anchorEl.getBoundingClientRect();
  menu.style.top   = (rect.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  const onOutside = e => { if (!menu.contains(e.target)) closeDisplayPicker(); };
  setTimeout(() => document.addEventListener('click', onOutside, true), 10);
  menu._onOutside = onOutside;
}

function closeDisplayPicker() {
  const m = document.querySelector('.display-picker');
  if (!m) return;
  if (m._onOutside) document.removeEventListener('click', m._onOutside, true);
  m.remove();
}

function setupEditorTabKey() {
  // Only register once
  if (el.mdEditor._tabBound) return;
  el.mdEditor._tabBound = true;
  el.mdEditor.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = el.mdEditor.selectionStart;
      const v = el.mdEditor.value;
      el.mdEditor.value = v.slice(0, s) + '  ' + v.slice(el.mdEditor.selectionEnd);
      el.mdEditor.selectionStart = el.mdEditor.selectionEnd = s + 2;
    }
  });
  el.mdEditor.addEventListener('input', () => {
    if (!state.isDirty) setDirty(true);
  });
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function updateStatusBar(res) {
  const name = (res.filePath || '').split(/[/\\]/).pop();
  el.statusFile.textContent = name || '';
  el.statusMeta.textContent = res.size != null ? formatSize(res.size) + (res.modified ? '  ·  ' + new Date(res.modified).toLocaleDateString() : '') : '';
}

function showError(msg) {
  el.welcome.style.display  = 'none';
  el.mdScroll.style.display = '';
  el.mdBody.innerHTML = `<div style="padding:32px;color:var(--text-muted)">⚠️ ${escapeHtml(String(msg))}</div>`;
}

// ─── Sidebar resize ───────────────────────────────────────────────────────────
function setupSidebarResize() {
  let dragging = false, startX = 0, startW = 0;

  el.sidebarResizer.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = el.sidebar.getBoundingClientRect().width;
    el.sidebarResizer.classList.add('dragging');
    document.body.style.cssText = 'cursor:col-resize;user-select:none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.max(160, Math.min(400, startW + e.clientX - startX));
    state.sidebarWidth = newW;
    el.sidebar.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    el.sidebarResizer.classList.remove('dragging');
    document.body.style.cssText = '';
    api.saveConfig({ sidebarWidth: state.sidebarWidth });
  });
}

// ─── Panel edge resize ────────────────────────────────────────────────────────
function setupEdgePanelResize() {
  let dragging = false, startX = 0, startW = 0;

  el.edgeResize.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.screenX;
    startW   = window.innerWidth;
    document.body.style.cssText = 'cursor:ew-resize;user-select:none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    api.resizeWindow(Math.max(300, Math.min(900, startW + (startX - e.screenX))));
  });

  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    startW   = window.innerWidth;
    document.body.style.cssText = '';
  });
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;

    if (e.key === 'Escape' && !e.shiftKey) {
      if (state.isEditing) enterViewMode(false);
      else api.hidePanel();
      return;
    }

    if (meta && e.key === '\\')                              { e.preventDefault(); toggleSidebar(); return; }
    if (meta && e.shiftKey && e.key.toUpperCase() === 'M')   { e.preventDefault(); api.togglePanel(); return; }
    if (meta && e.key === 'o')                               { e.preventDefault(); openFolderDialog(); return; }
    if (meta && e.key === 'n')                               { e.preventDefault(); newItemAtRoot(); return; }

    // Cmd/Ctrl+S — save
    if (meta && e.key === 's') {
      e.preventDefault();
      if (state.isEditing) saveCurrentFile();
      return;
    }

    // Cmd/Ctrl+E — toggle edit/view
    if (meta && e.key === 'e') {
      e.preventDefault();
      if (state.currentFile) toggleEditView();
      return;
    }
  });
}

// ─── Bind events ─────────────────────────────────────────────────────────────
function bindEvents() {
  el.btnSidebarToggle.addEventListener('click', toggleSidebar);
  el.btnDisplay.addEventListener('click', () => showDisplayPicker(el.btnDisplay));
  el.btnTheme.addEventListener('click', toggleTheme);
  el.btnPin.addEventListener('click', togglePin);
  el.btnImport.addEventListener('click', () => showBookmarkFolderPicker(el.btnImport));
  el.btnCollapse.addEventListener('click', collapseToTab);
  el.panelTabIcon.addEventListener('click', expandFromTab);
  el.btnExpand.addEventListener('click', expandFromTab);
  el.btnHide.addEventListener('click', () => api.quitApp());
  el.btnOpenFolder.addEventListener('click', openFolderDialog);
  el.btnNewFile.addEventListener('click', newItemAtRoot);

  // Editor toolbar
  el.btnEditMode.addEventListener('click', enterEditMode);
  el.btnSave.addEventListener('click', () => saveCurrentFile());
  el.btnViewMode.addEventListener('click', () => enterViewMode(false));

  setupSidebarResize();
  setupEdgePanelResize();
  setupKeyboard();

  api.onChromeReadingList(async items => {
    if (!state.currentFolder) {
      showError('Open a folder in Knowbase first, then export from the Chrome extension.');
      return;
    }
    const lines = ['# Reading List', '', '| Title | Date Added |', '|-------|------------|'];
    for (const item of items) {
      const ts = item.creationTime;
      const d = ts > 1e16 ? new Date(ts / 1e6)   // nanoseconds
              : ts > 1e13 ? new Date(ts / 1e3)    // microseconds
              : ts > 1e10 ? new Date(ts)           // milliseconds
              :             new Date(ts * 1e3);    // seconds
      const date = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const title = item.title.replace(/\|/g, '\\|');
      lines.push(`| [${title}](${item.url}) | ${date} |`);
    }
    const content = lines.join('\n') + '\n';
    const subFolder = state.currentFolder + '/Reading List';
    await api.createFolder(subFolder);
    const filePath = subFolder + '/Reading List.md';
    const res = await api.writeFile(filePath, content);
    if (!res.success) { showError('Could not save Reading List: ' + res.error); return; }
    await loadFolder(state.currentFolder);
    await openFile(filePath);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    api.getConfig().then(cfg => { if (cfg.dark === undefined) applyTheme(e.matches, false); });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileIconPath(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['md', 'markdown', 'mdown', 'mkd'].includes(ext))
    return `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 15V9l2 2 2-2v6"/><path d="M14 13l2 2 2-2"/>`;
  return `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>`;
}

function svgIcon(pathData, className, color) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color || 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);   // ← setAttribute, not .className (SVG)
  svg.innerHTML = pathData;
  return svg;
}

function formatSize(bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
