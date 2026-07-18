const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ProjectStore } = require('./lib/project-store');
const { CriteriaStore } = require('./lib/criteria-store');
const { AuditStore } = require('./lib/audit-store');
const { ExecutionEngine } = require('./lib/execution-engine');
const { AgentInterviewer } = require('./lib/agent-interviewer');
const { exportRun } = require('./lib/run-export');
const { validateGraph } = require('./lib/graph-validate');
const { listModels } = require('./lib/ollama-client');

const CONFIG_DEFAULTS = {
  schema: 1,
  endpoint: 'http://localhost:11434',
  defaultModel: 'llama3.1:latest',
  gateModel: null,
  assistModel: null,
  guidedCreate: 'ask',
  definitionsPath: path.join(os.homedir(), 'Documents', 'knowbase', 'Agents', 'definitions'),
  saveRuns: false,
  saveRunsPath: path.join(os.homedir(), 'Documents', 'knowbase', 'agentBase'),
  debugJsonColour: true,
  debugRenderMarkdown: true,
  maxSteps: 50,
  nodeTimeoutMs: 120000,
  lastProjectId: null,
  theme: 'dark'
};

let mainWindow;
let projectStore;
let criteriaStore;
let auditStore;
let engine;
const interviewer = new AgentInterviewer();
let configCache = null;

const configFile = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  if (configCache) return configCache;
  try {
    configCache = { ...CONFIG_DEFAULTS, ...JSON.parse(fs.readFileSync(configFile(), 'utf-8')) };
  } catch {
    configCache = { ...CONFIG_DEFAULTS };
  }
  return configCache;
}

function saveConfig(partial) {
  configCache = { ...loadConfig(), ...partial };
  fs.writeFileSync(configFile(), JSON.stringify(configCache, null, 2), 'utf-8');
  return configCache;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0e1014',
    icon: path.join(__dirname, 'assets', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

const expandHome = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.dock?.setIcon(path.join(__dirname, 'assets', 'icons', 'icon-512.png'));
    const userData = app.getPath('userData');
    projectStore = new ProjectStore(path.join(userData, 'projects'));
    criteriaStore = new CriteriaStore(path.join(userData, 'criteria-templates.json'));
    auditStore = new AuditStore(userData);
    engine = new ExecutionEngine(loadConfig());

    engine.on('event', (evt) => mainWindow?.webContents.send('exec:event', evt));
    engine.on('finished', (record) => {
      auditStore.saveRun(record);
      const edits = [{
        actor: `run:${record.runId}`,
        type: 'project-executed',
        subjectId: record.projectId,
        summary: `Run ${record.status} — ${record.events.length} events`
      }];
      const cfg = loadConfig();
      if (cfg.saveRuns) {
        try {
          const file = exportRun(record, expandHome(cfg.saveRunsPath));
          edits.push({ actor: `run:${record.runId}`, type: 'run-exported', subjectId: record.runId, summary: `Output saved to ${file}` });
        } catch (err) {
          const hint = err.code === 'EPERM' || err.code === 'EACCES' ? ' — grant Electron access to the folder in System Settings → Privacy & Security' : '';
          edits.push({ actor: `run:${record.runId}`, type: 'run-export-failed', subjectId: record.runId, summary: `Output export failed: ${err.message}${hint}` });
        }
      }
      auditStore.appendEdits(record.projectId, edits);
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

const ok = (data) => ({ success: true, ...data });
const fail = (err) => ({ success: false, error: err.message || String(err) });

ipcMain.handle('config:get', () => ok({ config: loadConfig() }));
ipcMain.handle('config:set', (_, partial) => ok({ config: saveConfig(partial) }));

ipcMain.handle('projects:list', () => ok({ projects: projectStore.list() }));
ipcMain.handle('projects:create', (_, name) => {
  const project = projectStore.create(name);
  auditStore.appendEdits(project.id, [{ type: 'project-created', subjectId: project.id, summary: `"${project.name}" created` }]);
  saveConfig({ lastProjectId: project.id });
  return ok({ project });
});
ipcMain.handle('projects:load', (_, id) => {
  const project = projectStore.load(id);
  if (!project) return fail(new Error('Project not found'));
  saveConfig({ lastProjectId: id });
  return ok({ project });
});
ipcMain.handle('projects:save', (_, project, edits) => {
  try {
    projectStore.save(project);
    auditStore.appendEdits(project.id, edits || []);
    return ok({});
  } catch (err) {
    return fail(err);
  }
});
ipcMain.handle('projects:delete', (_, id) => {
  projectStore.delete(id);
  return ok({});
});
ipcMain.handle('projects:validate', (_, project) => ok(validateGraph(project)));

ipcMain.handle('projects:export', async (_, id) => {
  const payload = projectStore.export(id, [...criteriaStore.list().builtin, ...criteriaStore.list().user]);
  if (!payload) return fail(new Error('Project not found'));
  const safeName = payload.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export project',
    defaultPath: `${safeName}.agentbase.json`,
    filters: [{ name: 'agentBase project', extensions: ['json'] }]
  });
  if (canceled || !filePath) return ok({ canceled: true });
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      dialog.showErrorBox('Export failed', `macOS blocked writing to ${path.dirname(filePath)}.\n\nGrant Electron access in System Settings → Privacy & Security → Files and Folders (or Full Disk Access), then try again.`);
    } else {
      dialog.showErrorBox('Export failed', err.message);
    }
    return fail(err);
  }
  auditStore.appendEdits(id, [{ type: 'project-exported', subjectId: id, summary: `Exported to ${filePath}` }]);
  return ok({ filePath });
});
ipcMain.handle('projects:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import project',
    properties: ['openFile'],
    filters: [{ name: 'agentBase project', extensions: ['json'] }]
  });
  if (canceled || !filePaths?.length) return ok({ canceled: true });
  try {
    const payload = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    criteriaStore.install(payload.templates);
    const project = projectStore.import(payload);
    auditStore.appendEdits(project.id, [{ type: 'project-imported', subjectId: project.id, summary: `Imported from ${filePaths[0]}` }]);
    return ok({ project });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('criteria:list', () => ok(criteriaStore.list()));
ipcMain.handle('criteria:save', (_, template) => {
  try {
    return ok({ template: criteriaStore.save(template) });
  } catch (err) {
    return fail(err);
  }
});
ipcMain.handle('criteria:delete', (_, id) => {
  try {
    criteriaStore.delete(id);
    return ok({});
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('audit:edits', (_, projectId) => ok({ entries: auditStore.listEdits(projectId) }));
ipcMain.handle('audit:runs', (_, projectId) => ok({ runs: auditStore.listRuns(projectId) }));
ipcMain.handle('audit:run', (_, runId) => {
  const run = auditStore.loadRun(runId);
  return run ? ok({ run }) : fail(new Error('Run not found'));
});

ipcMain.handle('exec:run', async (_, projectId, input) => {
  const project = projectStore.load(projectId);
  if (!project) return fail(new Error('Project not found'));
  try {
    const runId = await engine.run(project, input, loadConfig());
    return ok({ runId });
  } catch (err) {
    return fail(err);
  }
});
ipcMain.handle('exec:cancel', () => {
  engine.cancel();
  return ok({});
});

ipcMain.handle('interview:start', async (_, description) => {
  const cfg = loadConfig();
  let models = [];
  try { models = await listModels(cfg.endpoint); } catch { }
  const model = cfg.assistModel || cfg.defaultModel;
  if (models.length && !models.includes(model)) {
    return ok({ turn: { type: 'error', error: `Model "${model}" is not installed in Ollama. Pick an installed default or assist model in Settings.`, retryable: false } });
  }
  const turn = await interviewer.start(description, {
    endpoint: cfg.endpoint,
    model: cfg.assistModel || cfg.defaultModel,
    timeoutMs: cfg.nodeTimeoutMs,
    definitionsDir: expandHome(cfg.definitionsPath),
    models
  });
  return ok({ turn });
});
ipcMain.handle('interview:answer', async (_, text) => ok({ turn: await interviewer.answer(text) }));
ipcMain.handle('interview:generate', async () => ok({ turn: await interviewer.generateNow() }));
ipcMain.handle('interview:cancel', () => {
  interviewer.cancel();
  return ok({});
});

ipcMain.handle('ollama:models', async () => {
  try {
    return ok({ models: await listModels(loadConfig().endpoint) });
  } catch (err) {
    return fail(err);
  }
});

ipcMain.handle('app:version', () => ok({ version: app.getVersion() }));
