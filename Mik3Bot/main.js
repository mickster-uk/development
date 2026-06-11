const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { RAGService } = require('./src/rag-service');

const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');
let ragService;

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, 'build', 'icon.png');
}

// ── Persistent config (plain JSON in userData) ────────────────────────────
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

function getHistoryPath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(getHistoryPath(), 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(data) {
  try {
    fs.writeFileSync(getHistoryPath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

const DEFAULTS = {
  endpoint: 'http://localhost:11434',
  model: 'gemma4:latest',
  apiKey: '',
  renderMarkdown: true,
  storeHistory: true
};

const PANEL_WIDTH = 520;
let mainWindow;

function getWorkArea() {
  return screen.getPrimaryDisplay().workArea;
}

function createWindow() {
  const wa = getWorkArea();

  mainWindow = new BrowserWindow({
    width:  PANEL_WIDTH,
    height: 80,
    x: wa.x + wa.width - PANEL_WIDTH,
    y: wa.y + Math.floor(wa.height * 0.25),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

app.whenReady().then(() => {
  createWindow();

  const config = loadConfig();
  const knowledgePath = config.knowbasePath || KNOWLEDGE_PATH;
  ragService = new RAGService(knowledgePath, config.endpoint || DEFAULTS.endpoint);
  ragService.index().catch(e => console.error('RAG initial index failed:', e.message));

  // System tray — load from buffer so the path is guaranteed to resolve
  const trayImg = nativeImage.createFromBuffer(
    fs.readFileSync(getIconPath())
  ).resize({ width: 22, height: 22 });
  const tray = new Tray(trayImg);
  tray.setToolTip('Mik3Bot');
  const trayMenu = Menu.buildFromTemplate([
    { label: 'Show',  click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Hide',  click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Quit',  click: () => app.quit() },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });

  // Cmd/Ctrl+Shift+Space toggles the window
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Config IPC ────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => {
  return { ...DEFAULTS, ...loadConfig() };
});

ipcMain.handle('save-config', (event, data) => {
  saveConfig({ ...loadConfig(), ...data });
  if (data.endpoint && ragService) ragService.endpoint = data.endpoint;
  if ('knowbasePath' in data && ragService) {
    ragService.knowledgePath = data.knowbasePath || KNOWLEDGE_PATH;
    ragService.cachePath = path.join(ragService.knowledgePath, '.rag-cache.json');
    ragService.indexed = false;
    ragService.chunks = [];
  }
  return true;
});

ipcMain.handle('select-knowbase-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('rag-status', () => ragService ? ragService.getStatus() : { indexed: false, chunkCount: 0, fileCount: 0, lastError: null });

ipcMain.handle('rag-index', async () => {
  if (!ragService) return;
  return ragService.index();
});

ipcMain.handle('open-knowledge-folder', () => shell.openPath(KNOWLEDGE_PATH));

ipcMain.handle('save-starred', async (_, { prompt, response }) => {
  try {
    const cfg = loadConfig();
    const base = cfg.knowbasePath || KNOWLEDGE_PATH;
    const dir  = path.join(base, 'Starred');
    fs.mkdirSync(dir, { recursive: true });

    const slug = prompt.trim().slice(0, 50).replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim();
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${date} ${slug}.md`);

    const content = `# ${prompt.trim()}\n\n**Prompt:** ${prompt.trim()}\n\n**Response:**\n\n${response.trim()}\n\n---\n*Saved with Mik3Bot · ${new Date().toLocaleString()}*\n`;
    fs.writeFileSync(file, content, 'utf8');
    return { success: true, file };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('show-history-in-finder', () => shell.showItemInFolder(getHistoryPath()));

// ── WebAgent search ───────────────────────────────────────────────────────
async function queryWebAgent(prompt, webAgentUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL('/api/search', webAgentUrl);
      const transport = parsed.protocol === 'https:' ? https : http;
      const body = JSON.stringify({ query: prompt, limit: 3 });

      const req = transport.request({
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const { results } = JSON.parse(data);
            if (!Array.isArray(results) || !results.length) return resolve(null);
            const context = results
              .map(r => `**${r.title}** (${r.url})\n${r.content}`)
              .join('\n\n---\n\n');
            resolve(context);
          } catch { resolve(null); }
        });
      });

      req.setTimeout(10000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    } catch { resolve(null); }
  });
}

// ── API call ──────────────────────────────────────────────────────────────
ipcMain.handle('call-llama', async (event, { endpoint, apiKey, model, prompt, messages: historyMessages }) => {
  const baseUrl = endpoint || DEFAULTS.endpoint;
  const url = new URL('/api/chat', baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const cfg = loadConfig();

  // Full conversation history if provided; otherwise fall back to a single turn
  const conversationMessages = Array.isArray(historyMessages) && historyMessages.length
    ? historyMessages
    : [{ role: 'user', content: prompt }];

  // Use the latest user message for RAG / web context retrieval
  const latestUserContent = [...conversationMessages].reverse().find(m => m.role === 'user')?.content || prompt;

  const systemMessages = [];

  if (ragService && ragService.indexed) {
    const context = await ragService.retrieve(latestUserContent);
    if (context) systemMessages.push({ role: 'system', content: `Relevant knowledge:\n\n${context}` });
  }

  if (cfg.webAgentUrl) {
    const webContext = await queryWebAgent(latestUserContent, cfg.webAgentUrl);
    if (webContext) systemMessages.push({ role: 'system', content: `Web knowledge:\n\n${webContext}` });
  }

  const messages = [...systemMessages, ...conversationMessages];

  const body = JSON.stringify({
    model: model || DEFAULTS.model,
    messages,
    stream: false
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(typeof parsed.error === 'string' ? parsed.error : parsed.error.message || 'API error'));
            return;
          }
          // Ollama /api/chat → parsed.message.content
          // OpenAI-compatible fallback → parsed.choices[0].message.content
          // Llama API fallback → parsed.completion_message.content.text
          const content =
            parsed.message?.content ||
            parsed.choices?.[0]?.message?.content ||
            parsed.completion_message?.content?.text ||
            'No response received.';
          // Save to history if enabled
          const config = loadConfig();
          if (config.storeHistory !== false) {
            const history = loadHistory();
            history.push({
              timestamp: Date.now(),
              query: latestUserContent,
              response: content,
              model: model || DEFAULTS.model
            });
            saveHistory(history);
          }
          resolve(content);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 300)}`));
        }
      });
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timed out after 60s'));
    });

    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error(`Cannot connect to ${baseUrl}. Is Ollama running?`));
      } else {
        reject(e);
      }
    });

    req.write(body);
    req.end();
  });
});

// ── Window management IPC ─────────────────────────────────────────────────
ipcMain.on('resize-window', (event, { height }) => {
  if (mainWindow) {
    const wa = getWorkArea();
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: wa.x + wa.width - PANEL_WIDTH, y: bounds.y, width: PANEL_WIDTH, height }, true);
  }
});

ipcMain.handle('get-icon-data-url', () => {
  const data = fs.readFileSync(getIconPath());
  return `data:image/png;base64,${data.toString('base64')}`;
});

ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY });
  }
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('hide-app', () => mainWindow.hide());
ipcMain.handle('get-version', () => app.getVersion());
