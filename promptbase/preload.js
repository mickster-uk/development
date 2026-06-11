const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getModels: (endpoint) => ipcRenderer.invoke('get-models', endpoint),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  readTemplate: (fileName) => ipcRenderer.invoke('read-template', fileName),
  generatePrompt: (params) => ipcRenderer.invoke('generate-prompt', params),
  suggestTemplates: (params) => ipcRenderer.invoke('suggest-templates', params),
  runPrompt: (params) => ipcRenderer.invoke('run-prompt', params),
  refinePrompt: (params) => ipcRenderer.invoke('refine-prompt', params),
  enhancePrompt: (params) => ipcRenderer.invoke('enhance-prompt', params),
  savePrompt: (params) => ipcRenderer.invoke('save-prompt', params),
  saveTemplate: (params) => ipcRenderer.invoke('save-template', params)
});
