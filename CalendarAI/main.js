const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { CalendarService } = require('./src/calendar-service');
const { EventRAGService } = require('./src/event-rag-service');

const DEFAULTS = {
  endpoint: 'http://localhost:11434',
  model: 'gemma4:latest',
  embeddingModel: 'nomic-embed-text',
  clientId: '',
  clientSecret: '',
  similarityThreshold: 0.4,
  showWorking: false
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
  ragService = new EventRAGService(
    cfg.endpoint || DEFAULTS.endpoint,
    cfg.embeddingModel || DEFAULTS.embeddingModel
  );
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
  const prev = { ...DEFAULTS, ...loadConfig() };
  const config = { ...prev, ...data };
  saveConfig(config);

  // Only rebuild calendarService if credentials changed
  if (data.clientId !== undefined || data.clientSecret !== undefined) {
    if (config.clientId && config.clientSecret) {
      calendarService = new CalendarService(config.clientId, config.clientSecret, getTokensPath());
    } else {
      calendarService = null;
    }
  }

  // Update ragService endpoint/embeddingModel without recreating (preserves indexed state),
  // but if embeddingModel changed the existing embeddings are stale so reset.
  if (ragService) {
    if (data.endpoint && data.endpoint !== prev.endpoint) {
      ragService.endpoint = data.endpoint;
    }
    if (data.embeddingModel && data.embeddingModel !== prev.embeddingModel) {
      ragService.embeddingModel = data.embeddingModel;
      ragService.items = [];
      ragService.indexed = false;
      ragService.lastError = null;
    }
  }

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

// ── Calendars ─────────────────────────────────────────────────────────────────
ipcMain.handle('get-calendars', async () => {
  if (!calendarService?.isAuthenticated) return { error: 'Not authenticated.' };
  try {
    return { calendars: await calendarService.getCalendars() };
  } catch (e) {
    return { error: e.message };
  }
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
    const err = ragService?.lastError;
    return { error: err || 'Events are still indexing. Please wait a moment.' };
  }

  const config = { ...DEFAULTS, ...loadConfig() };
  const threshold = parseFloat(config.similarityThreshold) || DEFAULTS.similarityThreshold;
  const semantic = await ragService.retrieve(query, 5, threshold);

  // Always supplement with events in a date window around today so that
  // time-range queries ("next 2 weeks", "last week") work correctly regardless
  // of semantic similarity to event titles.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const dateWindow  = ragService.retrieveByDateRange(windowStart, windowEnd);

  const seenIds = new Set(semantic.map(r => r.event.id));
  const relevant = [...semantic];
  for (const item of dateWindow) {
    if (!seenIds.has(item.event.id)) {
      seenIds.add(item.event.id);
      relevant.push(item);
    }
  }

  // Sort merged set chronologically so the LLM reads events in time order
  relevant.sort((a, b) => {
    const aDate = a.event.start?.dateTime || a.event.start?.date || '';
    const bDate = b.event.start?.dateTime || b.event.start?.date || '';
    return aDate.localeCompare(bDate);
  });

  if (!relevant.length) {
    return { answer: "I couldn't find any calendar events relevant to that query.", events: [] };
  }

  const context = relevant.map(r => r.text).join('\n\n---\n\n');

  try {
    const res = await axios.post(`${config.endpoint}/api/chat`, {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `You are a helpful calendar assistant. Today's date is ${new Date().toISOString().slice(0, 10)}. Answer the user's question using only the calendar events provided below. Be concise and specific. If asked about upcoming or next events, use today's date to determine what is in the future. If asked to summarise, give key themes or patterns.

Calendar interpretation rules:
- Each event includes a "Calendar:" field showing which calendar it came from.
- When a calendar name contains a person's name (e.g. "Dara Rota", "Sharon Calendar", "Mike's Calendar"), treat events from that calendar as belonging to or representing that person. Refer to them by their first name in your answer — for example, events from "Dara Rota" are about Dara, events from "Sharon Calendar" are about Sharon.
- Do not refer to the calendar name itself in your answer; use the person's name instead.

Calendar events:

${context}`
        },
        { role: 'user', content: query }
      ],
      stream: false
    }, { timeout: 60000 });

    const answer = res.data?.message?.content || 'No response received.';
    return {
      answer,
      events: relevant.map(r => r.event),
      hits: semantic.map(r => ({ title: r.event.summary || '(No title)', score: r.score }))
    };
  } catch (e) {
    const detail = e.response?.data?.error || e.message;
    return { error: `LLM error: ${detail}` };
  }
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('close-window', () => app.quit());
