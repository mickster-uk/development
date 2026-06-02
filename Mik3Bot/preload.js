const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  callLlama: (params) => ipcRenderer.invoke('call-llama', params),
  resizeWindow: (height) => ipcRenderer.send('resize-window', { height }),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', { deltaX, deltaY }),
  closeApp: () => ipcRenderer.send('close-app'),
  hideApp: () => ipcRenderer.send('hide-app'),
  ragStatus: () => ipcRenderer.invoke('rag-status'),
  ragIndex: () => ipcRenderer.invoke('rag-index'),
  openKnowledgeFolder: () => ipcRenderer.invoke('open-knowledge-folder'),
  showHistoryInFinder: () => ipcRenderer.invoke('show-history-in-finder'),
  getVersion:            () => ipcRenderer.invoke('get-version'),
  getIconDataUrl:        () => ipcRenderer.invoke('get-icon-data-url'),
  selectKnowledgePath:   () => ipcRenderer.invoke('select-knowbase-folder'),
  saveStarred:           (data) => ipcRenderer.invoke('save-starred', data),
});
