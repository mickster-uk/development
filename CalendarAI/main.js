const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { CalendarService } = require('./src/calendar-service');
const { EventRAGService } = require('./src/event-rag-service');

const DEFAULTS = {
  endpoint: 'http://localhost:11434',
  model: 'llama3.2:latest',
  clientId: '',
  clientSecret: ''
};

let mainWindow;
let calendarService = null;
let ragService = null;

function getConfigPath() { return path.join(app.getPath('userData'), 'config.json'); }
function getTokensPath() { return path.join(app.getPath('userData'), 'tokens.json'); }

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); } catch { return {}; }
}

function saveConfig(data) {
  try { fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2)); } catch {}
}

function initServices(config) {
  const cfg = config || { ...DEFAULTS, ...loadConfig() };
  if (cfg.clientId && cfg.clientSecret) {
    calendarService = new CalendarService(cfg.clientId, cfg.clientSecret, getTokensPath());
  } else {
    calendarService = null;
  }
  ragService = new EventRAGService(cfg.endpoint || DEFAULTS.endpoint);
}

app.whenReady().then(() => {
  initServices();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: 940,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    x: Math.floor((width - 940) / 2),
    y: Math.floor((height - 700) / 2),
    frame: false,
    backgroundColor: '#0e0e10',
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Config ────────────────────────────────────────────────────────────────────
ipcMain.handle('get-config', () => ({ ...DEFAULTS, ...loadConfig() }));

ipcMain.handle('save-config', (e, data) => {
  const config = { ...loadConfig(), ...data };
  saveConfig(config);
  initServices({ ...DEFAULTS, ...config });
  return true;
});

// ── Auth ──────────────────────────────────────────────────────────────────────
ipcMain.handle('auth-status', () => ({
  hasCredentials: !!calendarService,
  isAuthenticated: calendarService?.isAuthenticated || false
}));

ipcMain.handle('authenticate', async () => {
  if (!calendarService) return { success: false, error: 'Configure Google credentials first.' };
  try {
    return await calendarService.authenticate();
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sign-out', () => {
  calendarService?.signOut();
  ragService && (ragService.items = [], ragService.indexed = false);
  return true;
});

// ── Events ────────────────────────────────────────────────────────────────────
ipcMain.handle('get-events', async (e, year) => {
  if (!calendarService?.isAuthenticated) return { error: 'Not authenticated.' };
  try {
    const events = await calendarService.getEvents(year);

    // Background RAG indexing with progress events to renderer
    if (ragService && events.length > 0) {
      ragService.indexEvents(
        events,
        (ev) => calendarService.eventToText(ev),
        (progress) => mainWindow?.webContents.send('rag-progress', progress)
      ).catch(err => console.error('RAG index error:', err.message));
    }

    return { events };
  } catch (e) {
    return { error: e.message };
  }
});

// ── RAG status ────────────────────────────────────────────────────────────────
ipcMain.handle('rag-status', () =>
  ragService?.getStatus() || { indexed: false, indexing: false, count: 0, progress: { current: 0, total: 0 } }
);

// ── Search (RAG → LLM) ────────────────────────────────────────────────────────
ipcMain.handle('search', async (e, { query }) => {
  if (!ragService?.indexed) {
    return { error: 'Events are still indexing. Please wait a moment.' };
  }

  const relevant = await ragService.retrieve(query);
  if (!relevant.length) {
    return { answer: "I couldn't find any calendar events relevant to that query.", events: [] };
  }

  const config = { ...DEFAULTS, ...loadConfig() };
  const context = relevant.map(r => r.text).join('\n\n---\n\n');

  try {
    const res = await axios.post(`${config.endpoint}/api/chat`, {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `You are a helpful calendar assistant. Answer the user's question using only the calendar events provided below. Be concise and specific. If asked to summarise, give key themes or patterns.\n\nCalendar events:\n\n${context}`
        },
        { role: 'user', content: query }
      ],
      stream: false
    }, { timeout: 60000 });

    const answer = res.data?.message?.content || 'No response received.';
    return { answer, events: relevant.map(r => r.event) };
  } catch (e) {
    return { error: `LLM error: ${e.message}` };
  }
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('close-window', () => mainWindow?.close());
