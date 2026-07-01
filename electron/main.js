const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const net = require('net');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3001;

// ── Data directory (OS user data folder) ─────────────────────────────────────
// Windows : C:\Users\<name>\AppData\Roaming\AstraNovaAI
// macOS   : ~/Library/Application Support/AstraNovaAI
// Linux   : ~/.config/AstraNovaAI
function getDataDir() {
  return app.getPath('userData');
}

// ── Legacy migration ──────────────────────────────────────────────────────────
// If a database exists in the old location (project root / cwd), move it once.
function migrateLegacyDb() {
  const dataDir = getDataDir();
  const newPath = path.join(dataDir, 'astranova.db');

  // Skip if new DB already exists
  if (fs.existsSync(newPath)) return;

  // Check old locations
  const candidates = [
    path.join(process.cwd(), 'data.db'),
    path.join(process.cwd(), 'astranova.db'),
    path.join(process.cwd(), 'data', 'astranova.db'),
    path.join(__dirname, '..', 'data.db'),
  ];

  for (const src of candidates) {
    if (fs.existsSync(src)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.copyFileSync(src, newPath);
        fs.renameSync(src, src + '.migrated');
        console.log(`[data] Migrated legacy DB from ${src} → ${newPath}`);
      } catch (err) {
        console.error('[data] Migration failed:', err);
      }
      return;
    }
  }

  console.log('[data] No legacy DB found — fresh install, starting clean.');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => { tester.close(); resolve(false); })
      .listen(port);
  });
}

function waitForServer(port, retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const client = net.createConnection({ port }, () => {
        client.destroy();
        resolve();
      });
      client.on('error', () => {
        if (++attempts >= retries) return reject(new Error('Server did not start'));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

// ── Server ────────────────────────────────────────────────────────────────────

async function startServer() {
  const inUse = await isPortInUse(SERVER_PORT);
  if (inUse) {
    console.log(`Port ${SERVER_PORT} already in use — skipping server start`);
    return;
  }

  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'dist', 'server', 'index.js')
    : path.join(__dirname, '..', 'dist', 'server', 'index.js');

  const dataDir = getDataDir();

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      VULTR_URL: 'http://104.156.247.16',
      RESOURCES_PATH: process.resourcesPath || '',
    },
    silent: true,
  });

  serverProcess.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
  serverProcess.stderr?.on('data', (d) => console.error('[server stderr]', d.toString().trim()));
  serverProcess.on('exit', (code, signal) => {
    console.log(`[server] exited with code ${code}, signal ${signal}`);
    if (code !== 0 && mainWindow) {
      mainWindow.webContents.send('server-error', `Server exited with code ${code}`);
    }
  });

  try {
    await waitForServer(SERVER_PORT);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[server] failed to start:', errMsg);
    throw new Error(`Server did not start. Check that port ${SERVER_PORT} is free and better-sqlite3 is installed correctly.`);
  }
  console.log(`[server] Ready on port ${SERVER_PORT} | data → ${dataDir}`);
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#020408',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Auto Updater ──────────────────────────────────────────────────────────────

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

// User clicked "Restart & Install" in the update banner
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Online/offline status from renderer
ipcMain.on('online-status', (_, isOnline) => {
  console.log('Network status:', isOnline ? 'online' : 'offline');
});

// Renderer can ask where data is stored (for a Settings → "Open data folder" button)
ipcMain.handle('get-user-data-path', () => {
  return getDataDir();
});

// Open the data folder in Finder / Explorer
ipcMain.on('open-data-folder', () => {
  shell.openPath(getDataDir());
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Run migration before server starts (server needs the DB in its new home)
  migrateLegacyDb();

  try {
    await startServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Startup Error', String(err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  serverProcess?.kill();
});
