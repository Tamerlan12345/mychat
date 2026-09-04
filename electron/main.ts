import { app, BrowserWindow, ipcMain, safeStorage, shell, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let localServer: http.Server | null = null;
let appOrigin = '';

/**
 * Vault persistence for DPAPI-encrypted secrets
 */
export function getVaultPath(): string {
  return path.join(app.getPath('userData'), 'secure-vault.json');
}

export function readVault(): Record<string, string> {
  const vaultPath = getVaultPath();
  try {
    if (!fs.existsSync(vaultPath)) {
      return {};
    }
    const raw = fs.readFileSync(vaultPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return {};
  } catch (err) {
    console.error('Failed to read vault file:', err);
    return {};
  }
}

export function writeVault(data: Record<string, string>): void {
  const vaultPath = getVaultPath();
  const dir = path.dirname(vaultPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${vaultPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, vaultPath);
}

export async function saveSecret(key: string, value: string): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage encryption is not available on this system');
    return false;
  }
  try {
    const encrypted = safeStorage.encryptString(value);
    const vault = readVault();
    vault[key] = encrypted.toString('base64');
    writeVault(vault);
    return true;
  } catch (err) {
    console.error(`Failed to save secret "${key}":`, err);
    return false;
  }
}

export async function getSecret(key: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage encryption is not available on this system');
    return null;
  }
  try {
    const vault = readVault();
    const encoded = vault[key];
    if (!encoded) {
      return null;
    }
    const buffer = Buffer.from(encoded, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (err) {
    console.error(`Failed to get secret "${key}":`, err);
    return null;
  }
}

export async function removeSecret(key: string): Promise<boolean> {
  try {
    const vault = readVault();
    if (key in vault) {
      delete vault[key];
      writeVault(vault);
    }
    return true;
  } catch (err) {
    console.error(`Failed to remove secret "${key}":`, err);
    return false;
  }
}

/**
 * Navigation restriction guard
 */
export function isAllowedLocalUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (appOrigin) {
      const originParsed = new URL(appOrigin);
      if (parsed.origin === originParsed.origin) {
        return true;
      }
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve local development or production server port
 */
async function resolveServerUrl(): Promise<string> {
  if (process.env.ELECTRON_START_URL) {
    return process.env.ELECTRON_START_URL;
  }

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    return 'http://127.0.0.1:3000';
  }

  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      const host = req.headers.host || '127.0.0.1';
      const reqUrl = new URL(req.url || '/', `http://${host}`);
      const filePath = path.join(__dirname, '..', 'public', reqUrl.pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const stream = fs.createReadStream(filePath);
        return stream.pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Centras Chat</title></head><body><div id="__next">Centras Corporate Chat</div></body></html>');
    });

    localServer.listen(0, '127.0.0.1', () => {
      const addr = localServer?.address() as net.AddressInfo;
      resolve(`http://127.0.0.1:${addr.port}`);
    });

    localServer.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Register strictly typed and validated IPC handlers
 */
function registerIpcHandlers(): void {
  ipcMain.handle('safe-storage:is-available', () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('desktop:save-secret', async (_event, ...args: any[]) => {
    let key: string;
    let value: string;
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      key = args[0].key;
      value = args[0].value;
    } else {
      key = args[0];
      value = args[1];
    }
    return saveSecret(key, value);
  });

  ipcMain.handle('safe-storage:encrypt', async (_event, ...args: any[]) => {
    let key: string;
    let value: string;
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      key = args[0].key;
      value = args[0].value;
    } else {
      key = args[0];
      value = args[1];
    }
    return saveSecret(key, value);
  });

  ipcMain.handle('desktop:get-secret', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    return getSecret(key);
  });

  ipcMain.handle('safe-storage:decrypt', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    return getSecret(key);
  });

  ipcMain.handle('desktop:remove-secret', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    return removeSecret(key);
  });

  ipcMain.handle('desktop:get-platform-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      isElectron: true,
    };
  });

  ipcMain.handle('desktop:set-badge-count', (_event, count: number) => {
    const badgeCount = typeof count === 'number' && count >= 0 ? count : 0;
    if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(badgeCount);
    }
    if (mainWindow && process.platform === 'win32') {
      if (badgeCount > 0) {
        mainWindow.flashFrame(true);
      }
    }
    return true;
  });

  ipcMain.handle('desktop:ping-server', async (_event, ...args: any[]) => {
    const targetUrl = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'url' in args[0])
      ? args[0].url
      : args[0];

    if (!targetUrl || typeof targetUrl !== 'string') {
      return { ok: false, error: 'Invalid URL' };
    }

    try {
      const parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, error: 'Unsupported protocol' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(targetUrl, {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return { ok: response.ok, status: response.status };
      } catch {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), 5000);
        const response = await fetch(targetUrl, {
          method: 'GET',
          signal: getController.signal,
        });
        clearTimeout(getTimeoutId);
        return { ok: response.ok, status: response.status };
      }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' };
    }
  });
}

/**
 * Initialize Tray
 */
function createTray(): void {
  const iconPath = path.join(__dirname, '../public/favicon.ico');
  if (fs.existsSync(iconPath)) {
    try {
      const icon = nativeImage.createFromPath(iconPath);
      tray = new Tray(icon);
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Показать Centras Chat',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Выход',
          click: () => {
            app.quit();
          },
        },
      ]);
      tray.setToolTip('Centras Corporate Chat');
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    } catch (e) {
      console.warn('Tray initialization failed:', e);
    }
  }
}

/**
 * Create hardened main browser window
 */
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        event.preventDefault();
      }
    });
  }

  // Restrict child window creation and route external URLs to system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Restrict navigation away from allowed local origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedLocalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const startUrl = await resolveServerUrl();
  appOrigin = startUrl;

  await mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  registerIpcHandlers();

  app.whenReady().then(async () => {
    await createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (localServer) {
      localServer.close();
      localServer = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
