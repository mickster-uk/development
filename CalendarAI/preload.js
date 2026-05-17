const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:      ()       => ipcRenderer.invoke('get-config'),
  saveConfig:     (data)   => ipcRenderer.invoke('save-config', data),
  authStatus:     ()       => ipcRenderer.invoke('auth-status'),
  authenticate:   ()       => ipcRenderer.invoke('authenticate'),
  signOut:        ()       => ipcRenderer.invoke('sign-out'),
  getEvents:      (year)   => ipcRenderer.invoke('get-events', year),
  ragStatus:      ()       => ipcRenderer.invoke('rag-status'),
  search:         (params) => ipcRenderer.invoke('search', params),
  onRagProgress:  (cb)     => ipcRenderer.on('rag-progress', (e, data) => cb(data)),
  minimizeWindow: ()       => ipcRenderer.send('minimize-window'),
  maximizeWindow: ()       => ipcRenderer.send('maximize-window'),
  closeWindow:    ()       => ipcRenderer.send('close-window')
});
