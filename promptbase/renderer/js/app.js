const $ = (id) => document.getElementById(id);

const state = {
  templates: [],
  promptCandidates: [],
  selectedPromptIndex: 0,
  suggestions: [],
  models: [],
  workflowStep: 1
};

const workflowTips = {
  1: 'Describe your idea and optionally pick a template, then click Generate Prompts.',
  2: 'Select a candidate that best matches your intent, then click "Apply Best Practices" to polish it.',
  3: 'Test the refined prompt to see the output. Use "Enhance Prompt" to iterate before saving.',
  4: 'Save the prompt once the output matches your goal.',
};

let statusTimer = null;

function setStatus(message, isError = false) {
  if (!message) return;
  const bar = $('statusBar');
  if (!bar) return;
  clearTimeout(statusTimer);
  bar.textContent = message;
  bar.className = `status-bar visible ${isError ? 'error' : 'success'}`;
  if (!isError) {
    statusTimer = setTimeout(() => {
      bar.className = 'status-bar';
    }, 3000);
  }
}

function splitCandidates(raw) {
  if (!raw) return [];
  const chunks = raw
    .split(/\n-{3,}\n|\n#{3,}\n|\n\*\*\*\n|\n===\n/)
    .map((text) => text.trim())
    .filter(Boolean);
  return chunks.length ? chunks : [raw.trim()];
}

function renderTemplates() {
  const list = $('templatesList');
  list.innerHTML = '';
  const select = $('templateSelect');
  select.innerHTML = '<option value="">None</option>';

  state.templates.forEach((template) => {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.innerHTML = `<strong>${template.title}</strong><p>${template.useCase}</p>`;
    item.addEventListener('click', () => selectTemplate(template.fileName));
    list.appendChild(item);

    const option = document.createElement('option');
    option.value = template.fileName;
    option.textContent = template.title;
    select.appendChild(option);
  });
}

function selectTemplate(fileName) {
  const template = state.templates.find((item) => item.fileName === fileName);
  const details = $('templateDetails');
  const select = $('templateSelect');
  select.value = fileName || '';

  if (!template) {
    $('templateUseCase').textContent = 'Select a template to view its use case and qualifying questions.';
    $('templateQuestions').innerHTML = '';
    details.classList.add('hidden');
    return;
  }

  details.classList.remove('hidden');

  $('templateUseCase').textContent = template.useCase || 'No description available.';
  $('templateQuestions').innerHTML = template.questions.length
    ? `<ul>${template.questions.map((question) => `<li>${question}</li>`).join('')}</ul>`
    : '<p>No qualifying questions available.</p>';
  details.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPromptCandidates() {
  const list = $('candidatesList');
  list.innerHTML = '';
  if (!state.promptCandidates.length) {
    list.innerHTML = '<p class="empty-message">No prompts generated yet.</p>';
    updateActionState();
    return;
  }
  state.promptCandidates.forEach((candidate, index) => {
    const item = document.createElement('div');
    item.className = `candidate-item${index === state.selectedPromptIndex ? ' selected' : ''}`;
    item.innerHTML = `
      <div><strong>Prompt ${index + 1}</strong></div>
      <pre>${candidate.slice(0, 220)}</pre>
    `;

    item.addEventListener('click', () => {
      state.selectedPromptIndex = index;
      $('selectedPrompt').value = candidate;
      $('selectedPreview').textContent = candidate;
      renderPromptCandidates();
      updateActionState();
    });
    list.appendChild(item);
  });
}

function renderSuggestions() {
  const list = $('suggestionsList');
  list.innerHTML = '';
  if (!state.suggestions.length) {
    list.innerHTML = '<p class="empty-message">No template suggestions yet.</p>';
    return;
  }
  state.suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    const questions = Array.isArray(suggestion.qualifyingQuestions)
      ? suggestion.qualifyingQuestions.map((q) => `<li>${q}</li>`).join('')
      : `<li>${suggestion.qualifyingQuestions}</li>`;
    item.innerHTML = `
      <div><strong>${suggestion.name || `Suggestion ${index + 1}`}</strong></div>
      <div>${suggestion.useCase || ''}</div>
      <div><strong>Qualifying questions</strong></div>
      <ul>${questions}</ul>
    `;
    list.appendChild(item);
  });
}

async function saveSettings() {
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const promptsDir = $('promptsDirInput').value.trim();
  const generatorModel = $('generatorModel').value;
  const taskModel = $('taskModel').value;
  const promptCount = Number($('promptCount').value) || 3;
  const btn = $('btnSaveSettings');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await api.saveConfig({ endpoint, apiKey, promptsDir, generatorModel, taskModel, promptCount });
    setStatus('Settings saved.');
    closeModal('settingsModal');
  } catch (error) {
    setStatus(`Failed to save settings: ${error.message || error}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Settings';
  }
}

async function refreshModels(silent = false) {
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const btn = $('btnRefreshModels');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';
  try {
    const models = await api.getModels(endpoint);
    state.models = Array.isArray(models) ? models : [];
    const generator = $('generatorModel');
    const task = $('taskModel');
    generator.innerHTML = '';
    task.innerHTML = '';
    state.models.forEach((model) => {
      const optionA = document.createElement('option');
      optionA.value = model;
      optionA.textContent = model;
      generator.appendChild(optionA);
      const optionB = document.createElement('option');
      optionB.value = model;
      optionB.textContent = model;
      task.appendChild(optionB);
    });
    if (!generator.value && state.models.length) generator.value = state.models[0];
    if (!task.value && state.models.length) task.value = state.models[0];
    await api.saveConfig({ endpoint, apiKey, generatorModel: generator.value, taskModel: task.value });
    setStatus('Model list refreshed.');
  } catch (error) {
    if (!silent) setStatus(`Unable to load models: ${error.message || error}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh Available Models';
  }
}

async function loadTemplates() {
  try {
    state.templates = await api.getTemplates();
    renderTemplates();
  } catch (error) {
    setStatus(`Could not load templates: ${error.message || error}`, true);
  }
}

async function generatePrompts() {
  const idea = $('ideaInput').value.trim();
  if (!idea) {
    setStatus('Provide a rough idea before generating prompts.', true);
    return;
  }
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const generatorModel = $('generatorModel').value;
  if (!generatorModel) {
    setStatus('No generator model selected. Open Settings and refresh models.', true);
    return;
  }
  const promptCount = Number($('promptCount').value) || 3;
  const templateName = $('templateSelect').value;

  $('btnGeneratePrompts').disabled = true;
  $('btnGeneratePrompts').textContent = 'Generating...';
  try {
    const raw = await api.generatePrompt({ endpoint, apiKey, model: generatorModel, idea, template: templateName, count: promptCount });
    state.promptCandidates = splitCandidates(raw);
    state.selectedPromptIndex = 0;
    if (state.promptCandidates.length) {
      $('selectedPrompt').value = state.promptCandidates[0];
    }
    renderPromptCandidates();
    setWorkflowStep(2);
    updateActionState();
    setStatus('Prompts generated successfully. Select a candidate to test.');
  } catch (error) {
    setStatus(`Prompt generation failed: ${error.message || error}`, true);
  } finally {
    $('btnGeneratePrompts').disabled = false;
    $('btnGeneratePrompts').textContent = 'Generate prompts';
  }
}

async function runPrompt(overridePrompt) {
  const prompt = (overridePrompt || $('selectedPrompt').value).trim();
  if (!prompt) {
    $('responseOutput').textContent = '⚠ No prompt entered. Type a prompt in the "Final Prompt" box above, or go through Steps 1 & 2 to generate one.';
    setStatus('Enter a prompt first.', true);
    return;
  }
  setWorkflowStep(3);
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const taskModel = $('taskModel').value;
  $('btnRunPrompt').disabled = true;
  $('btnRunPrompt').textContent = 'Testing...';
  $('responseOutput').textContent = 'Running prompt...';
  try {
    const response = await api.runPrompt({ endpoint, apiKey, model: taskModel, prompt });
    $('responseOutput').textContent = response;
  } catch (error) {
    setStatus(`Task execution failed: ${error.message || error}`, true);
    $('responseOutput').textContent = 'Failed to run the prompt.';
  } finally {
    $('btnRunPrompt').disabled = false;
    $('btnRunPrompt').textContent = 'Test Prompt';
    updateActionState();
  }
}

async function enhancePrompt() {
  const prompt = $('selectedPrompt').value.trim();
  const response = $('responseOutput').textContent.trim();
  const instructions = $('enhancementInput').value.trim();
  if (!prompt || !response || !instructions) {
    setStatus('You need a selected prompt, a response, and enhancement instructions.', true);
    return;
  }
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const generatorModel = $('generatorModel').value;
  $('btnEnhancePrompt').disabled = true;
  $('btnEnhancePrompt').textContent = 'Improving...';
  try {
    const improved = await api.enhancePrompt({ endpoint, apiKey, model: generatorModel, prompt, response, instructions });
    $('selectedPrompt').value = improved;
    setStatus('Prompt enhanced successfully.');
  } catch (error) {
    setStatus(`Enhancement failed: ${error.message || error}`, true);
  } finally {
    $('btnEnhancePrompt').disabled = false;
    $('btnEnhancePrompt').textContent = 'Enhance prompt';
    updateActionState();
  }
}

async function refinePrompt() {
  const candidate = $('selectedPrompt').value.trim();
  if (!candidate) {
    setStatus('Select a candidate prompt first.', true);
    return;
  }
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const generatorModel = $('generatorModel').value;
  if (!generatorModel) {
    setStatus('No generator model selected. Open Settings and refresh models.', true);
    return;
  }
  $('btnRefinePrompt').disabled = true;
  $('btnRefinePrompt').textContent = 'Applying best practices...';
  try {
    const refined = await api.refinePrompt({ endpoint, apiKey, model: generatorModel, candidate });
    $('selectedPrompt').value = refined;
    $('selectedPreview').textContent = refined;
    setWorkflowStep(3);
    updateActionState();
    setStatus('Prompt refined. Ready to test.');
  } catch (error) {
    setStatus(`Refinement failed: ${error.message || error}`, true);
  } finally {
    $('btnRefinePrompt').disabled = false;
    $('btnRefinePrompt').textContent = 'Apply Best Practices';
  }
}

async function suggestTemplates() {
  const idea = $('ideaInput').value.trim();
  if (!idea) {
    setStatus('Enter a rough idea to get template suggestions.', true);
    return;
  }
  const endpoint = $('endpointInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  const generatorModel = $('generatorModel').value;
  if (!generatorModel) {
    setStatus('No generator model selected. Open Settings and refresh models.', true);
    return;
  }
  $('btnSuggestTemplates').disabled = true;
  $('btnSuggestTemplates').textContent = 'Suggesting...';
  try {
    const suggestions = await api.suggestTemplates({ endpoint, apiKey, model: generatorModel, idea });
    state.suggestions = Array.isArray(suggestions) ? suggestions : [];
    renderSuggestions();
    setStatus('Template suggestions loaded.');
  } catch (error) {
    setStatus(`Template suggestion failed: ${error.message || error}`, true);
  } finally {
    $('btnSuggestTemplates').disabled = false;
    $('btnSuggestTemplates').textContent = 'Suggest Ideas';
  }
}

async function savePrompt() {
  const promptText = $('selectedPrompt').value.trim();
  if (!promptText) {
    setStatus('There is no prompt to save.', true);
    return;
  }
  setWorkflowStep(4);
  const idea = $('ideaInput').value.trim();
  const promptTitle = idea ? idea.slice(0, 80) : 'Saved prompt';
  const templateName = $('templateSelect').value;
  const generatorModel = $('generatorModel').value;
  const taskModel = $('taskModel').value;
  const responseText = $('responseOutput').textContent.trim();
  const notes = $('enhancementInput').value.trim();
  $('btnSavePrompt').disabled = true;
  $('btnSavePrompt').textContent = 'Saving...';
  try {
    const filePath = await api.savePrompt({ promptTitle, idea, templateName, generatorModel, taskModel, promptText, responseText, notes });
    setStatus(`Prompt saved to ${filePath}`);
  } catch (error) {
    setStatus(`Saving prompt failed: ${error.message || error}`, true);
  } finally {
    $('btnSavePrompt').disabled = false;
    $('btnSavePrompt').textContent = 'Save Prompt';
  }
}

function bindEvents() {
  // Tab navigation
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Workflow step pills
  document.querySelectorAll('.step-pill').forEach(btn => {
    btn.addEventListener('click', () => setWorkflowStep(Number(btn.dataset.step)));
  });

  // Settings modal
  $('btnSettings').addEventListener('click', () => openModal('settingsModal'));
  $('settingsModal').querySelector('.modal-close').addEventListener('click', () => closeModal('settingsModal'));
  $('settingsModal').querySelector('.modal-overlay').addEventListener('click', () => closeModal('settingsModal'));

  // Existing buttons
  $('btnSaveSettings').addEventListener('click', () => saveSettings());
  $('btnRefreshModels').addEventListener('click', () => refreshModels());
  $('btnGeneratePrompts').addEventListener('click', () => generatePrompts());
  $('btnRefinePrompt').addEventListener('click', () => refinePrompt());
  $('btnRunPrompt').addEventListener('click', () => runPrompt());
  $('btnEnhancePrompt').addEventListener('click', () => enhancePrompt());
  $('btnSavePrompt').addEventListener('click', () => savePrompt());
  $('btnSaveTemplate').addEventListener('click', () => saveTemplate());
  $('btnSuggestTemplates').addEventListener('click', () => suggestTemplates());
  $('templateSelect').addEventListener('change', (event) => selectTemplate(event.target.value));
  $('selectedPrompt').addEventListener('input', updateActionState);
  $('enhancementInput').addEventListener('input', updateActionState);
  setWorkflowStep(state.workflowStep);
  updateActionState();
}

function switchTab(tabName) {
  // Update active tab button
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update active tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.dataset.tab === tabName);
  });
}

function updateActionState() {
  const promptText = $('selectedPrompt').value.trim();
  const responseText = $('responseOutput').textContent.trim();
  const enhancementText = $('enhancementInput').value.trim();

  $('btnRefinePrompt').disabled = !promptText;
  $('btnSavePrompt').disabled = !promptText;
  $('btnEnhancePrompt').disabled = !(promptText && responseText && enhancementText);
}

function openModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = $(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function setWorkflowStep(step) {
  if (typeof step !== 'number' || step < 1 || step > 4) {
    step = 1;
  }
  state.workflowStep = step;
  document.querySelectorAll('.step-pill').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.step) === step);
  });

  const tip = $('workflowTip');
  if (tip) {
    tip.textContent = workflowTips[step] || '';
  }

  document.querySelectorAll('[data-step-panel]').forEach((panel) => {
    const panelStep = Number(panel.dataset.stepPanel);
    const isActivePanel = panelStep === step || (step === 4 && panelStep === 3);
    panel.classList.toggle('highlight', isActivePanel);
    panel.classList.toggle('step-inactive', !isActivePanel);
  });
  updateActionState();
}


async function saveTemplate() {
  const title = $('templateTitle').value.trim();
  if (!title) {
    setStatus('Provide a template title before saving.', true);
    return;
  }

  const useCase = $('templateUseCaseInput').value.trim();
  const questions = $('templateQuestionsInput').value.trim().split(/\r?\n/).filter(Boolean);
  const structure = $('templatePromptStructure').value.trim();

  $('btnSaveTemplate').disabled = true;
  $('btnSaveTemplate').textContent = 'Saving...';

  try {
    const result = await api.saveTemplate({ title, useCase, questions, structure });
    setStatus(`Template saved: ${result.fileName}`);
    $('templateTitle').value = '';
    $('templateUseCaseInput').value = '';
    $('templateQuestionsInput').value = '';
    $('templatePromptStructure').value = '';
    await loadTemplates();
    $('templateSelect').value = result.fileName;
    selectTemplate(result.fileName);
  } catch (error) {
    setStatus(`Saving template failed: ${error.message || error}`, true);
  } finally {
    $('btnSaveTemplate').disabled = false;
    $('btnSaveTemplate').textContent = 'Save template';
  }
}

async function init() {
  bindEvents();
  let savedGeneratorModel = '';
  let savedTaskModel = '';
  try {
    const config = await api.getConfig();
    $('endpointInput').value = config.endpoint || 'http://localhost:11434/v1';
    $('apiKeyInput').value = config.apiKey || '';
    $('promptCount').value = config.promptCount || 3;
    $('promptsDirInput').value = config.promptsDir || '';
    savedGeneratorModel = config.generatorModel || '';
    savedTaskModel = config.taskModel || '';
  } catch {
    $('endpointInput').value = 'http://localhost:11434/v1';
  }
  await loadTemplates();
  await refreshModels(true);
  if (savedGeneratorModel) $('generatorModel').value = savedGeneratorModel;
  if (savedTaskModel) $('taskModel').value = savedTaskModel;
  setWorkflowStep(state.workflowStep);
  updateActionState();
}

init();
