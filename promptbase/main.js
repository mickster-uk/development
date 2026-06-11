const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const CONFIG_FILE = path.join(app.getPath('userData'), 'promptbase-config.json');
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const TEMPLATES_DIR = path.join(PROMPTS_DIR, 'templates');
const DEFAULT_PROMPTS_DIR = path.join(app.getPath('documents'), 'knowbase', 'prompts');

function ensureFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      endpoint: normalizeEndpoint(cfg.endpoint || 'http://localhost:11434/v1'),
      apiKey: cfg.apiKey || '',
      generatorModel: cfg.generatorModel || 'llama3',
      taskModel: cfg.taskModel || 'llama3',
      promptCount: cfg.promptCount || 3,
      promptsDir: cfg.promptsDir || DEFAULT_PROMPTS_DIR
    };
  } catch {
    return {
      endpoint: 'http://localhost:11434/v1',
      apiKey: '',
      generatorModel: 'llama3',
      taskModel: 'llama3',
      promptCount: 3,
      promptsDir: DEFAULT_PROMPTS_DIR
    };
  }
}

function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return 'http://localhost:11434/v1';
  }
  return endpoint.trim().replace(/\/+$/, '');
}

function saveConfig(config) {
  const current = loadConfig();
  const merged = { ...current, ...config, endpoint: normalizeEndpoint(config.endpoint || current.endpoint) };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}


function requestJson(url, options = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${res.statusMessage}: ${data}`));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url.href}: ${err.message}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request to ${url.href} timed out after ${timeoutMs / 1000}s`));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function isChatModel(model) {
  return typeof model === 'string' && !/(embed|embedding|text-embedding)/i.test(model);
}

function normalizeModelList(parsed) {
  const normalize = (entries, selector) => entries
    .map((entry) => selector(entry) || String(entry))
    .filter(Boolean);

  const result = Array.isArray(parsed)
    ? normalize(parsed, (entry) => entry.name || entry.id)
    : Array.isArray(parsed.models)
      ? normalize(parsed.models, (entry) => entry.name || entry.id)
      : Array.isArray(parsed.data)
        ? normalize(parsed.data, (entry) => entry.id || entry.name)
        : normalize(Object.keys(parsed), (entry) => entry);

  const chatModels = result.filter(isChatModel);
  return chatModels.length ? chatModels : result;
}

async function callOllamaChat(endpoint, apiKey, model, messages) {
  if (!isChatModel(model)) {
    throw new Error(`Selected model "${model}" does not support chat.`);
  }
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const candidatePaths = ['/api/chat', '/v1/chat/completions'];
  const body = JSON.stringify({ model, messages, stream: false });

  for (const candidatePath of candidatePaths) {
    const url = new URL(candidatePath, normalizedEndpoint);
    try {
      const parsed = await requestJson(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body
      });
      if (parsed.error) {
        throw new Error(typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || 'API error'));
      }
      return parsed.message?.content
        || parsed.choices?.[0]?.message?.content
        || parsed.completion_message?.content?.text
        || 'No response received.';
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed to call chat endpoint for ${endpoint}. Tried /api/chat and /v1/chat/completions.`);
}

async function getOllamaModels(endpoint) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const base = normalizedEndpoint;
  const candidatePaths = ['/api/models', '/v1/models'];
  let lastError = null;

  for (const candidatePath of candidatePaths) {
    try {
      const url = new URL(candidatePath, base);
      const parsed = await requestJson(url);
      return normalizeModelList(parsed);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw new Error(`Could not fetch models from ${endpoint}: ${lastError?.message || 'unknown error'}`);
}

function parseTemplateMarkdown(content) {
  const useCaseMatch = content.match(/##\s*Use case\s*\n([\s\S]*?)(?:\n##|$)/i);
  const questionsMatch = content.match(/##\s*Qualifying questions\s*\n([\s\S]*?)(?:\n##|$)/i);
  const nameMatch = content.match(/^#\s*(.+)$/m);
  const description = useCaseMatch ? useCaseMatch[1].trim().split('\n')[0] : '';
  const questions = questionsMatch ? questionsMatch[1].trim().split(/\r?\n/).filter(Boolean) : [];
  return {
    title: nameMatch ? nameMatch[1].trim() : null,
    useCase: description,
    questions
  };
}

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => saveConfig(cfg));
ipcMain.handle('get-templates', async () => {
  ensureFolder(TEMPLATES_DIR);
  const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => {
    const filePath = path.join(TEMPLATES_DIR, entry.name);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseTemplateMarkdown(content);
    return {
      fileName: entry.name,
      title: parsed.title || entry.name.replace(/\.md$/, ''),
      useCase: parsed.useCase || '',
      questions: parsed.questions,
      preview: content.split(/\r?\n/).slice(0, 6).join(' ')
    };
  });
});
ipcMain.handle('read-template', async (_, fileName) => {
  try {
    const filePath = path.join(TEMPLATES_DIR, fileName);
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
});
ipcMain.handle('save-template', async (_, { title, useCase, questions, structure }) => {
  ensureFolder(TEMPLATES_DIR);
  const safeName = (title || 'new-template')
    .trim()
    .slice(0, 80)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'template';
  const fileName = `${safeName}.md`;
  const filePath = path.join(TEMPLATES_DIR, fileName);
  const questionLines = (questions || [])
    .map((question) => (question || '').trim())
    .filter(Boolean)
    .map((question) => `- ${question}`);
  const content = [
    `# ${title}`,
    '',
    '## Use case',
    useCase || 'Describe when this template should be used.',
    '',
    '## Qualifying questions',
    ...questionLines,
    '',
    '## Prompt structure',
    structure || ''
  ].join('\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  return { fileName, filePath };
});
ipcMain.handle('get-models', async (_, endpoint) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  return await getOllamaModels(target);
});
ipcMain.handle('generate-prompt', async (_, { endpoint, apiKey, model, idea, template, count }) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  const system = `You are a prompt engineer. Create ${count} concise, high-quality prompts based on the user's rough idea.`;
  const templateSection = template ? `
Template name: ${template}
` : '';
  const user = `Rough idea: ${idea}\n${templateSection}\nReturn only the prompt candidates separated by \n---\n.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const raw = await callOllamaChat(target, apiKey, model || cfg.generatorModel, messages);
  return raw;
});
ipcMain.handle('suggest-templates', async (_, { endpoint, apiKey, model, idea }) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  const system = `You are a prompt template advisor. Help the user transform a rough idea into a reusable prompt template with a short explanation of what the template is best used for.`;
  const user = `Rough idea: ${idea}\nReturn valid JSON only as an array of objects with keys: name, useCase, qualifyingQuestions.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  const raw = await callOllamaChat(target, apiKey, model || cfg.generatorModel, messages);
  try {
    return JSON.parse(raw.replace(/^[^\[{]*/, '').replace(/[^\]}]*$/, ''));
  } catch {
    return [{ name: 'Suggested template', useCase: raw, qualifyingQuestions: [] }];
  }
});
ipcMain.handle('run-prompt', async (_, { endpoint, apiKey, model, prompt }) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  const messages = [
    { role: 'system', content: 'You are an AI assistant that executes the prompt as a task, with a helpful and concise response.' },
    { role: 'user', content: prompt }
  ];
  return await callOllamaChat(target, apiKey, model || cfg.taskModel, messages);
});
ipcMain.handle('refine-prompt', async (_, { endpoint, apiKey, model, candidate }) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  const system = `You are an expert prompt engineer. Rewrite the given prompt using these best practices:
1. Open with a clear role: "You are a [specific expert]..."
2. State the task concisely and without ambiguity
3. Include relevant context, constraints, and output format
4. Remove filler words and redundancy
5. Structure for precision so the model gives a focused, useful response
Return ONLY the improved prompt text — no explanation, no commentary.`;
  const user = `Rewrite this prompt using best practices:\n\n${candidate}`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  return await callOllamaChat(target, apiKey, model || cfg.generatorModel, messages);
});
ipcMain.handle('enhance-prompt', async (_, { endpoint, apiKey, model, prompt, response, instructions }) => {
  const cfg = loadConfig();
  const target = endpoint || cfg.endpoint;
  const system = 'You are a prompt improvement assistant. Improve the prompt to achieve a better response based on the original output and the user instructions.';
  const user = `Original prompt:\n${prompt}\n\nModel response:\n${response}\n\nEnhancement request:\n${instructions}\n\nReturn an improved prompt only.`;
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  return await callOllamaChat(target, apiKey, model || cfg.generatorModel, messages);
});
ipcMain.handle('save-prompt', async (_, { promptTitle, idea, templateName, generatorModel, taskModel, promptText, responseText, notes }) => {
  const cfg = loadConfig();
  const outputDir = cfg.promptsDir || DEFAULT_PROMPTS_DIR;
  ensureFolder(outputDir);
  const safeName = (promptTitle || idea || 'saved-prompt')
    .trim()
    .slice(0, 80)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'prompt';
  const fileName = `${safeName}-${Date.now()}.md`;
  const filePath = path.join(outputDir, fileName);
  const contentLines = [
    `# ${promptTitle || idea || 'Saved prompt'}`,
    '',
    `**Rough idea:** ${idea || 'N/A'}`,
    `**Template:** ${templateName || 'None'}`,
    `**Prompt generator model:** ${generatorModel || 'N/A'}`,
    `**Task model:** ${taskModel || 'N/A'}`,
    `**Saved:** ${new Date().toLocaleString()}`,
    '',
    '## Prompt',
    '',
    promptText || '',
    '',
    '## Response',
    '',
    responseText || 'No response saved.',
    '',
    '## Notes',
    '',
    notes || 'None.'
  ];
  fs.writeFileSync(filePath, contentLines.join('\n'), 'utf-8');
  return filePath;
});

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icons', 'icon-512.png');
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: 'Promptbase',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIcon = path.join(__dirname, 'build', 'icons', 'icon-512.png');
    if (fs.existsSync(dockIcon)) app.dock.setIcon(dockIcon);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Always quit the app when all windows are closed. On macOS the default
  // behavior is to keep the application running, but this tool is intended
  // to exit the Electron runtime when the last window is closed so that
  // `npm start` or packaged apps don't leave background processes running.
  try {
    app.quit();
  } catch (e) {
    // Fallback: force exit if app.quit fails for any reason
    try { process.exit(0); } catch (_) {}
  }
});
