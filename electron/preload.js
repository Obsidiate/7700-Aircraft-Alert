const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('app7700', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Resources
  getResources: () => ipcRenderer.invoke('get-resources'),
  saveResources: (resources) => ipcRenderer.invoke('save-resources', resources),

  // Status
  getStatus: () => ipcRenderer.invoke('get-status'),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Events from main process
  onNewAlert: (cb) => ipcRenderer.on('new-alert', (_, data) => cb(data)),
  onAircraftUpdate: (cb) => ipcRenderer.on('aircraft-update', (_, data) => cb(data)),

  // Cleanup
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Version & simulation
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  simulateAlert: (ac) => ipcRenderer.invoke('simulate-alert', ac),

  // Overpass proxy (avoids CSP restrictions in renderer)
  overpassQuery: (query) => ipcRenderer.invoke('overpass-query', query),
})
