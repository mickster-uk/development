const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Strategy
  saveStrategy:     (strategy) => ipcRenderer.invoke('save-strategy', strategy),
  loadStrategy:     ()         => ipcRenderer.invoke('load-strategy'),

  // Data
  fetchNow:         ()         => ipcRenderer.invoke('fetch-now'),
  getStockData:     (ticker)   => ipcRenderer.invoke('get-stock-data', ticker),

  // Recommendations
  getRecommendations: ()       => ipcRenderer.invoke('get-recommendations'),
  getUniverse:        ()       => ipcRenderer.invoke('get-universe'),

  // Preferences
  starTicker:       (ticker)   => ipcRenderer.invoke('star-ticker', ticker),
  unstarTicker:     (ticker)   => ipcRenderer.invoke('unstar-ticker', ticker),
  dismissTicker:    (ticker)   => ipcRenderer.invoke('dismiss-ticker', ticker),
  resetDismissed:   ()         => ipcRenderer.invoke('reset-dismissed'),

  // App config
  saveConfig:       (cfg)      => ipcRenderer.invoke('save-config', cfg),
  loadConfig:       ()         => ipcRenderer.invoke('load-config'),

  // AI analysis
  getAiAnalysis:    (payload)  => ipcRenderer.invoke('get-ai-analysis', payload),
  onAiChunk:        (cb)       => ipcRenderer.on('ai-chunk',  (_e, text) => cb(text)),
  onAiDone:         (cb)       => ipcRenderer.on('ai-done',   () => cb()),

  // Debug
  analyseDebug:         (payload) => ipcRenderer.invoke('analyse-debug', payload),
  onDebugEvent:         (cb)      => ipcRenderer.on('debug-event',     (_e, entry) => cb(entry)),
  onDebugAiChunk:       (cb)      => ipcRenderer.on('debug-ai-chunk',  (_e, text)  => cb(text)),
  onDebugAiDone:        (cb)      => ipcRenderer.on('debug-ai-done',   () => cb()),

  // Strategy review
  previewUniverse:    (strategy) => ipcRenderer.invoke('preview-universe', strategy),
  getStrategyPrompt:  (strategy) => ipcRenderer.invoke('get-strategy-prompt', strategy),
  copyAndOpenClaude:  (text)     => ipcRenderer.invoke('copy-and-open-claude', text),
  importWatchlist:    (text)     => ipcRenderer.invoke('import-watchlist', text),

  // Navigation
  openDashboard:    ()         => ipcRenderer.invoke('open-dashboard'),
  openInterview:    ()         => ipcRenderer.invoke('open-interview'),

  // Fetch control
  retryFetch:       ()         => ipcRenderer.invoke('retry-fetch'),

  // Events from main process
  onFetchStatus:    (cb)       => ipcRenderer.on('fetch-status',    (_e, msg)  => cb(msg)),
  onFetchComplete:  (cb)       => ipcRenderer.on('fetch-complete',  ()         => cb()),
  onFetchPaused:    (cb)       => ipcRenderer.on('fetch-paused',    (_e, data) => cb(data)),
});
