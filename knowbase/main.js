const {
  app, BrowserWindow, ipcMain, globalShortcut,
  screen, dialog, shell, Menu, Tray, nativeImage
} = require('electron');
const path = require('path');
const fs   = require('fs');

// ─── Constants ───────────────────────────────────────────────────────────────
const CFG = {
  PANEL_WIDTH:    480,
  MIN_WIDTH:      300,
  MAX_WIDTH:      900,
  SLIDE_DURATION: 220,   // ms
  TAB_WIDTH:       40,   // collapsed-to-tab strip width
};

const MARKDOWN_EXT = new Set([
  '.md', '.markdown', '.mdown', '.mkd', '.mkdn',
  '.mdwn', '.mdtxt', '.mdtext', '.txt'
]);

const CHROME_BOOKMARKS_CANDIDATES = [
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome Beta', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome Dev', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Google', 'Chrome Canary', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Chromium', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser', 'Default', 'Bookmarks'),
  path.join(app.getPath('home'), 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Bookmarks'),
];

function findChromeBookmarksFile() {
  return CHROME_BOOKMARKS_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

function collectBookmarkLinks(node, links) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'url' && node.url) {
    links.push({ title: node.name || node.url, url: node.url });
    return;
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(child => collectBookmarkLinks(child, links));
  }
}

function searchReadingListFolders(node, matches) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'folder' && String(node.name || '').toLowerCase() === 'reading list') {
    matches.push(node);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(child => searchReadingListFolders(child, matches));
  }
}

function extractReadingListLinks(bookmarks) {
  const roots = bookmarks.roots || {};
  const folders = [];
  ['reading_list', 'other', 'bookmark_bar', 'synced'].forEach(rootName => {
    const root = roots[rootName];
    if (root) searchReadingListFolders(root, folders);
  });
  if (roots.reading_list && typeof roots.reading_list === 'object') {
    folders.push(roots.reading_list);
  }
  const links = [];
  if (folders.length > 0) {
    folders.forEach(folder => collectBookmarkLinks(folder, links));
    return links;
  }
  Object.values(roots).forEach(root => collectBookmarkLinks(root, links));
  return links;
}

function buildReadingListMarkdown(links) {
  const lines = ['# Reading List', ''];
  for (const item of links) {
    lines.push(`- [${item.title}](${item.url})`);
  }
  return lines.join('\n') + '\n';
}

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow;
let tray;
let isPanelOpen       = true;
let isAnimating       = false;
let isTabMode         = false;  // collapsed to thin strip
let configCache       = null;
let activeDisplayId   = null;   // null = always use primary

// ─── Window helpers ───────────────────────────────────────────────────────────
function getWorkArea() {
  if (activeDisplayId !== null) {
    const d = screen.getAllDisplays().find(d => d.id === activeDisplayId);
    if (d) return d.workArea;
  }
  return screen.getPrimaryDisplay().workArea;
}

async function createWindow() {
  const wa = getWorkArea();

  const winOpts = {
    width:           CFG.PANEL_WIDTH,
    height:          wa.height,
    x:               wa.x + wa.width - CFG.PANEL_WIDTH,
    y:               wa.y,
    frame:           false,
    transparent:     true,
    backgroundColor: '#00000000',
    hasShadow:       true,
    icon:            path.join(__dirname, 'assets', 'icons', 'icon-512.png'),
    resizable:       false,   // custom left-edge resize handle
    movable:         false,   // stays at the right edge
    alwaysOnTop:     false,
    skipTaskbar:     false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false,
      preload:          path.join(__dirname, 'preload.js')
    }
  };

  // macOS frosted-glass vibrancy
  if (process.platform === 'darwin') {
    winOpts.vibrancy = 'under-window';
    winOpts.visualEffectState = 'active';
  }

  mainWindow = new BrowserWindow(winOpts);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Restore last open folder on ready
  mainWindow.webContents.on('did-finish-load', () => {
    const cfg = loadConfig();
    if (cfg.lastFolder && fs.existsSync(cfg.lastFolder)) {
      mainWindow.webContents.send('restore-folder', cfg.lastFolder);
    }
  });
}

// ─── Slide animation ──────────────────────────────────────────────────────────
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateX(fromX, toX, duration, onDone) {
  const startTime = Date.now();
  function tick() {
    const elapsed  = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = easeOutCubic(progress);
    const x        = Math.round(fromX + (toX - fromX) * eased);
    try {
      const [, y] = mainWindow.getPosition();
      mainWindow.setPosition(x, y);
    } catch (_) { return; }
    if (progress < 1) setTimeout(tick, 8);
    else { mainWindow.setPosition(toX, mainWindow.getPosition()[1]); onDone(); }
  }
  tick();
}

function slideIn() {
  if (isAnimating) return;
  isAnimating = true;
  const wa        = getWorkArea();
  const [pw]      = mainWindow.getSize();
  const targetX   = wa.x + wa.width - pw;
  const startX    = wa.x + wa.width + 10;

  mainWindow.setPosition(startX, wa.y);
  mainWindow.show();
  mainWindow.focus();
  animateX(startX, targetX, CFG.SLIDE_DURATION, () => {
    isPanelOpen = true;
    isAnimating = false;
  });
}

function slideOut() {
  if (isAnimating) return;
  isAnimating = true;
  const wa      = getWorkArea();
  const [startX] = mainWindow.getPosition();
  const targetX  = wa.x + wa.width + 10;

  animateX(startX, targetX, CFG.SLIDE_DURATION, () => {
    mainWindow.hide();
    isPanelOpen = false;
    isAnimating = false;
  });
}

function togglePanel() {
  if (isAnimating) return;
  isPanelOpen ? slideOut() : slideIn();
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('read-directory', async (_, dirPath) => {
  try {
    return { success: true, tree: readDirTree(dirPath), rootPath: dirPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const content  = fs.readFileSync(filePath, 'utf-8');
    const stat     = fs.statSync(filePath);
    return { success: true, content, filePath, size: stat.size, modified: stat.mtime.toISOString() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-folder-dialog', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Markdown Folder'
  });
  if (!res.canceled && res.filePaths.length) {
    const folderPath = res.filePaths[0];
    saveConfig({ lastFolder: folderPath });
    return { success: true, folderPath };
  }
  return { success: false, canceled: true };
});

ipcMain.handle('import-chrome-reading-list', async (_, folderPath) => {
  const bookmarksFile = findChromeBookmarksFile();
  if (!bookmarksFile) {
    return { success: false, error: 'Could not find Chrome bookmarks file. Open Chrome or install a supported browser first.' };
  }

  try {
    const raw = fs.readFileSync(bookmarksFile, 'utf-8');
    const bookmarks = JSON.parse(raw);
    const links = extractReadingListLinks(bookmarks);
    if (!links.length) {
      return { success: false, error: 'No Reading List entries were found in Chrome bookmarks.' };
    }

    const outputFile = path.join(folderPath, 'Reading List.md');
    fs.writeFileSync(outputFile, buildReadingListMarkdown(links), 'utf-8');
    return { success: true, filePath: outputFile, count: links.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-config',    ()          => loadConfig());
ipcMain.handle('save-config',   (_, data)   => { saveConfig(data); return { success: true }; });

ipcMain.handle('write-file', async (_, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    const stat = fs.statSync(filePath);
    return { success: true, size: stat.size, modified: stat.mtime.toISOString() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('create-file', async (_, filePath) => {
  try {
    if (fs.existsSync(filePath)) return { success: false, error: 'File already exists' };
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, '', 'utf-8');
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('create-folder', async (_, folderPath) => {
  try {
    if (fs.existsSync(folderPath)) return { success: false, error: 'Folder already exists' };
    fs.mkdirSync(folderPath, { recursive: true });
    return { success: true, folderPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-file', async (_, filePath) => {
  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('rename-file', async (_, oldPath, newPath) => {
  try {
    fs.renameSync(oldPath, newPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('toggle-panel',  ()          => togglePanel());
ipcMain.handle('hide-panel',    ()          => { if (isPanelOpen) slideOut(); });
ipcMain.handle('quit-app',      ()          => app.quit());

ipcMain.handle('collapse-to-tab', () => {
  if (isTabMode) return;
  isTabMode = true;
  const wa = getWorkArea();
  const [, h] = mainWindow.getSize();
  mainWindow.setBounds({ x: wa.x + wa.width - CFG.TAB_WIDTH, y: wa.y, width: CFG.TAB_WIDTH, height: h });
  return { success: true };
});

ipcMain.handle('expand-from-tab', () => {
  if (!isTabMode) return;
  isTabMode = false;
  const wa  = getWorkArea();
  const cfg = loadConfig();
  const w   = Math.max(CFG.MIN_WIDTH, Math.min(CFG.MAX_WIDTH, cfg.panelWidth || CFG.PANEL_WIDTH));
  const [, h] = mainWindow.getSize();
  mainWindow.setBounds({ x: wa.x + wa.width - w, y: wa.y, width: w, height: h });
  return { success: true };
});

ipcMain.handle('get-displays', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id:        d.id,
    index:     i + 1,
    isPrimary: d.id === primary.id,
    isActive:  d.id === (activeDisplayId ?? primary.id),
    width:     d.workArea.width,
    height:    d.workArea.height,
  }));
});

ipcMain.handle('dock-to-display', (_, displayId) => {
  const all     = screen.getAllDisplays();
  const target  = all.find(d => d.id === displayId) || screen.getPrimaryDisplay();
  activeDisplayId = target.id;
  const wa      = target.workArea;
  const [w]     = mainWindow.getSize();
  mainWindow.setBounds({ x: wa.x + wa.width - w, y: wa.y, width: w, height: wa.height });
  if (!isPanelOpen) { mainWindow.show(); isPanelOpen = true; }
  mainWindow.focus();
  saveConfig({ activeDisplayId: activeDisplayId });
  return { success: true };
});

ipcMain.handle('open-external', (_, url)    => { shell.openExternal(url); });
ipcMain.handle('get-platform',  ()          => process.platform);
ipcMain.handle('get-version',   ()          => app.getVersion());

ipcMain.handle('set-always-on-top', (_, val) => {
  mainWindow.setAlwaysOnTop(val, 'floating');
  return { success: true };
});

// Custom resize: renderer sends desired pixel width
ipcMain.on('resize-window', (_, newWidth) => {
  const clamped = Math.max(CFG.MIN_WIDTH, Math.min(CFG.MAX_WIDTH, newWidth));
  const wa      = getWorkArea();
  const [, h]   = mainWindow.getSize();
  mainWindow.setBounds({ x: wa.x + wa.width - clamped, y: wa.y, width: clamped, height: h });
  saveConfig({ panelWidth: clamped });
});

// ─── File system ─────────────────────────────────────────────────────────────
function readDirTree(dirPath, depth = 0) {
  if (depth > 6) return [];
  let items;
  try { items = fs.readdirSync(dirPath); } catch (_) { return []; }

  const result = [];
  for (const name of items) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(dirPath, name);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }

    if (stat.isDirectory()) {
      const children = readDirTree(full, depth + 1);
      result.push({ type: 'directory', name, path: full, children });
    } else if (MARKDOWN_EXT.has(path.extname(name).toLowerCase())) {
      result.push({ type: 'file', name, path: full, size: stat.size, modified: stat.mtime.toISOString() });
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return result;
}

// ─── Config ──────────────────────────────────────────────────────────────────
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }

function loadConfig() {
  if (configCache) return configCache;
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      configCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return configCache;
    }
  } catch (_) {}
  return {};
}

function saveConfig(updates) {
  try {
    configCache = { ...loadConfig(), ...updates };
    fs.writeFileSync(configPath(), JSON.stringify(configCache, null, 2), 'utf-8');
  } catch (e) { console.error('Config save failed:', e.message); }
}

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await createWindow();

  // Restore last panel width & active display
  const cfg = loadConfig();
  if (cfg.activeDisplayId) {
    const exists = screen.getAllDisplays().some(d => d.id === cfg.activeDisplayId);
    if (exists) activeDisplayId = cfg.activeDisplayId;
  }
  if (cfg.panelWidth) {
    const wa = getWorkArea();
    const w  = Math.max(CFG.MIN_WIDTH, Math.min(CFG.MAX_WIDTH, cfg.panelWidth));
    mainWindow.setBounds({ x: wa.x + wa.width - w, y: wa.y, width: w, height: wa.height });
  }

  // Global toggle shortcut
  globalShortcut.register('CommandOrControl+Shift+M', togglePanel);

  // Tray icon (optional – graceful fallback)
  try {
    const iconData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVQ4T2NkYGD4' +
      'z8BQDwAAAP//AwBY3wH/AgMBkwAAAABJRU5ErkJggg==', 'base64');
    tray = new Tray(nativeImage.createFromBuffer(iconData, { width: 16, height: 16 }));
    tray.setToolTip('Knowbase');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show',  click: () => { if (!isPanelOpen) slideIn(); else mainWindow.focus(); } },
      { label: 'Hide',  click: () => { if (isPanelOpen) slideOut(); } },
      { type: 'separator' },
      { label: 'Quit',  click: () => app.quit() }
    ]));
    tray.on('click', () => togglePanel());
  } catch (_) { /* tray not critical */ }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit',         () => globalShortcut.unregisterAll());
app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else if (!isPanelOpen) slideIn();
  else mainWindow.focus();
});

// Reposition when screen geometry changes (must be after app ready)
app.whenReady().then(() => {
  screen.on('display-metrics-changed', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const wa = getWorkArea();
    if (isTabMode) {
      mainWindow.setBounds({ x: wa.x + wa.width - CFG.TAB_WIDTH, y: wa.y, width: CFG.TAB_WIDTH, height: wa.height });
    } else {
      const [w] = mainWindow.getSize();
      mainWindow.setBounds({ x: wa.x + wa.width - w, y: wa.y, width: w, height: wa.height });
    }
  });
});
