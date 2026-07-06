const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// ── Logger ────────────────────────────────────────────────────────────────────
let _logStream = null;
function getLogPath() {
  const base = process.env.APPDATA || process.env.HOME || require('os').tmpdir();
  const dir = path.join(base, 'AstraNovaAI');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'startup.log');
}
function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  process.stdout.write(msg);
  try {
    if (!_logStream) _logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
    _logStream.write(msg);
  } catch {}
}
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err.stack || err.message);
});

const APP_URL = 'https://app.astranovaai.io';
let mainWindow = null;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0f1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  log(`[startup] Loading ${APP_URL}`);
  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    log('[startup] Window shown');
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  log(`[startup] App ready, version=${app.getVersion()}, platform=${process.platform}`);
  createWindow();

  // Check for updates after window is ready
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Auto-updater events ───────────────────────────────────────────────────────
autoUpdater.on('update-available', () => {
  log('[updater] Update available');
  if (mainWindow) mainWindow.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
  log('[updater] Update downloaded — will install on restart');
  if (mainWindow) mainWindow.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
  log('[updater] Error:', err.message);
});

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
