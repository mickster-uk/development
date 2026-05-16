const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Import bot orchestrator and RAG service
const { BotOrchestrator } = require('./src/bot-orchestrator');
const { RAGService } = require('./src/rag-service');

const KNOWLEDGE_PATH = path.join(__dirname, 'knowledge');

let mainWindow;
let orchestrator;
let ragService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1050,
    height: 675,
    minWidth: 900,
    minHeight: 525,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  // Load saved endpoint so RAG uses the right Ollama URL from the start
  let savedEndpoint = 'http://localhost:11434';
  try {
    const configPath = path.join(app.getPath('userData'), 'bot-tester-config.json');
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (saved.endpoint) savedEndpoint = saved.endpoint;
    }
  } catch {}

  orchestrator = new BotOrchestrator();
  ragService = new RAGService(KNOWLEDGE_PATH, savedEndpoint);
  orchestrator.setRAGService(ragService);

  // Index in the background — don't block the window from opening
  ragService.index().then(result => {
    console.log(`RAG: indexed ${result.chunkCount} chunks from ${result.fileCount} files`);
  }).catch(e => {
    console.error('RAG: index error:', e.message);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC Handlers
ipcMain.handle('run-test', async (event, query, model1, model2, model3, endpoint, requestConfig, responseConfig) => {
  try {
    const result = await orchestrator.runTest(query, model1, model2, model3, endpoint, requestConfig, responseConfig);
    return result;
  } catch (error) {
    console.error('Error running test:', error);
    throw error;
  }
});

ipcMain.handle('run-bot1', async (event, query, model1, endpoint, requestConfig) => {
  return orchestrator.runBot1Step(query, model1, endpoint, requestConfig);
});

ipcMain.handle('run-bot2', async (event, bot1Query, model2, endpoint, responseConfig) => {
  return orchestrator.runBot2Step(bot1Query, model2, endpoint, responseConfig);
});

ipcMain.handle('run-bot3', async (event, bot1Query, bot2Response, model3, endpoint) => {
  return orchestrator.runBot3Step(bot1Query, bot2Response, model3, endpoint);
});

ipcMain.handle('get-models', async (event, endpoint) => {
  try {
    const models = await orchestrator.getAvailableModels(endpoint);
    return models;
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
});

ipcMain.handle('get-config', () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'bot-tester-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return {
      endpoint: 'http://localhost:11434',
      model1: 'llama2',
      model2: 'mistral',
      model3: 'neural-chat'
    };
  } catch (error) {
    console.error('Error loading config:', error);
    return {};
  }
});

ipcMain.handle('save-config', (event, config) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'bot-tester-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    if (ragService && config.endpoint) ragService.endpoint = config.endpoint;
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    throw error;
  }
});

ipcMain.handle('rag-status', () => {
  return ragService ? ragService.getStatus() : { indexed: false, chunkCount: 0, knowledgePath: KNOWLEDGE_PATH, lastError: null };
});

ipcMain.handle('rag-index', async () => {
  if (!ragService) return { error: 'RAG service not initialised' };
  try {
    return await ragService.index();
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('clear-history', (event) => {
  try {
    const historyPath = path.join(app.getPath('userData'), 'bot-tester-history.json');
    fs.writeFileSync(historyPath, JSON.stringify([], null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error clearing history:', error);
    throw error;
  }
});

ipcMain.handle('get-history', () => {
  try {
    const historyPath = path.join(app.getPath('userData'), 'bot-tester-history.json');
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
    return [];
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
});

ipcMain.handle('export-file', async (event, { defaultName, content }) => {
  const ext = defaultName.split('.').pop();
  const filters = ext === 'js'
    ? [{ name: 'JavaScript Test File', extensions: ['js'] }]
    : [{ name: 'JUnit XML', extensions: ['xml'] }];

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf8');
    return result.filePath;
  }
  return null;
});

ipcMain.handle('save-history', (event, history) => {
  try {
    const historyPath = path.join(app.getPath('userData'), 'bot-tester-history.json');
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving history:', error);
    throw error;
  }
});
