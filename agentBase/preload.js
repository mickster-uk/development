const { contextBridge, ipcRenderer } = require('electron');
const { marked } = require('marked');

marked.setOptions({ gfm: true, breaks: true });

contextBridge.exposeInMainWorld('agentbase', {
  parseMarkdown: (md) => marked.parse(md),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (partial) => ipcRenderer.invoke('config:set', partial),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  loadProject: (id) => ipcRenderer.invoke('projects:load', id),
  saveProject: (project, edits) => ipcRenderer.invoke('projects:save', project, edits),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  validateProject: (project) => ipcRenderer.invoke('projects:validate', project),
  exportProject: (id) => ipcRenderer.invoke('projects:export', id),
  importProject: () => ipcRenderer.invoke('projects:import'),
  listCriteria: () => ipcRenderer.invoke('criteria:list'),
  saveCriteria: (template) => ipcRenderer.invoke('criteria:save', template),
  deleteCriteria: (id) => ipcRenderer.invoke('criteria:delete', id),
  auditEdits: (projectId) => ipcRenderer.invoke('audit:edits', projectId),
  auditRuns: (projectId) => ipcRenderer.invoke('audit:runs', projectId),
  auditRun: (runId) => ipcRenderer.invoke('audit:run', runId),
  startInterview: (description) => ipcRenderer.invoke('interview:start', description),
  answerInterview: (text) => ipcRenderer.invoke('interview:answer', text),
  generateAgent: () => ipcRenderer.invoke('interview:generate'),
  cancelInterview: () => ipcRenderer.invoke('interview:cancel'),
  runProject: (projectId, input) => ipcRenderer.invoke('exec:run', projectId, input),
  cancelRun: () => ipcRenderer.invoke('exec:cancel'),
  listModels: () => ipcRenderer.invoke('ollama:models'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onExecEvent: (cb) => {
    const handler = (_, evt) => cb(evt);
    ipcRenderer.on('exec:event', handler);
    return () => ipcRenderer.removeListener('exec:event', handler);
  }
});
