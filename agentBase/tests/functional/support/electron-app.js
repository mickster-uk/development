const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..', '..', '..');

const CONFIG_DEFAULTS = {
  schema: 1,
  endpoint: 'http://127.0.0.1:1',
  defaultModel: 'test-model:latest',
  gateModel: null,
  assistModel: null,
  guidedCreate: 'ask',
  definitionsPath: path.join(os.homedir(), 'Documents', 'knowbase', 'Agents', 'definitions'),
  saveRuns: false,
  saveRunsPath: os.tmpdir(),
  debugJsonColour: true,
  debugRenderMarkdown: true,
  maxSteps: 50,
  nodeTimeoutMs: 15000,
  lastProjectId: null,
  theme: 'dark'
};

async function launchApp(configOverrides = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbase-test-'));
  const config = { ...CONFIG_DEFAULTS, ...configOverrides };
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: [APP_ROOT, `--user-data-dir=${userDataDir}`],
    env,
    cwd: APP_ROOT
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { electronApp, window, userDataDir };
}

async function closeApp({ electronApp, userDataDir }) {
  await electronApp.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

module.exports = { launchApp, closeApp, CONFIG_DEFAULTS };
