const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),
  callLlama: (params) => ipcRenderer.invoke('call-llama', params),
  resizeWindow: (height) => ipcRenderer.send('resize-window', { height }),
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', { deltaX, deltaY }),
  closeApp: () => ipcRenderer.send('close-app'),
  hideApp: () => ipcRenderer.send('hide-app')
});
