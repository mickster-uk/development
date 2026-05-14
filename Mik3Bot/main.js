const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

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

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 520,
    height: 80,
    x: Math.floor((width - 520) / 2),
    y: Math.floor(height * 0.25),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
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
  return true;
});

// ── API call ──────────────────────────────────────────────────────────────
ipcMain.handle('call-llama', async (event, { endpoint, apiKey, model, prompt }) => {
  const baseUrl = endpoint || DEFAULTS.endpoint;
  const url = new URL('/api/chat', baseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const body = JSON.stringify({
    model: model || DEFAULTS.model,
    messages: [{ role: 'user', content: prompt }],
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
              query: prompt,
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
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ ...bounds, height }, true);
  }
});

ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY });
  }
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('hide-app', () => mainWindow.hide());
