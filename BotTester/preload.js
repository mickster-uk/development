const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botTesterAPI', {
  runTest: (query, model1, model2, model3, endpoint, requestConfig, responseConfig) =>
    ipcRenderer.invoke('run-test', query, model1, model2, model3, endpoint, requestConfig, responseConfig),

  runBot1: (query, model1, endpoint, requestConfig) =>
    ipcRenderer.invoke('run-bot1', query, model1, endpoint, requestConfig),

  runBot2: (bot1Query, model2, endpoint, responseConfig) =>
    ipcRenderer.invoke('run-bot2', bot1Query, model2, endpoint, responseConfig),

  runBot3: (bot1Query, bot2Response, model3, endpoint) =>
    ipcRenderer.invoke('run-bot3', bot1Query, bot2Response, model3, endpoint),
  
  getModels: (endpoint) =>
    ipcRenderer.invoke('get-models', endpoint),
  
  getConfig: () =>
    ipcRenderer.invoke('get-config'),
  
  saveConfig: (config) =>
    ipcRenderer.invoke('save-config', config),
  
  clearHistory: () =>
    ipcRenderer.invoke('clear-history'),
  
  getHistory: () =>
    ipcRenderer.invoke('get-history'),
  
  saveHistory: (history) =>
    ipcRenderer.invoke('save-history', history),

  exportFile: (defaultName, content) =>
    ipcRenderer.invoke('export-file', { defaultName, content }),

  ragStatus: () =>
    ipcRenderer.invoke('rag-status'),

  ragIndex: () =>
    ipcRenderer.invoke('rag-index')
});
