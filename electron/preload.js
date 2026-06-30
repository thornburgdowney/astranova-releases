const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auto-updater ────────────────────────────────────────────────────────────
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  installUpdate: () => ipcRenderer.send('install-update'),

  // ── Network status ──────────────────────────────────────────────────────────
  reportOnlineStatus: (isOnline) => ipcRenderer.send('online-status', isOnline),

  // ── Data folder ─────────────────────────────────────────────────────────────
  // Returns the OS path where AstraNovaAI stores its database
  // e.g. C:\Users\Gabriel\AppData\Roaming\AstraNovaAI  (Windows)
  //      ~/Library/Application Support/AstraNovaAI      (macOS)
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Opens the data folder in Finder (Mac) or Explorer (Windows)
  openDataFolder: () => ipcRenderer.send('open-data-folder'),

  // ── Platform info ───────────────────────────────────────────────────────────
  platform: process.platform,
  isElectron: true,
});
