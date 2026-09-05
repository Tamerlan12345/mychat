import { app, BrowserWindow, ipcMain, safeStorage, shell, Menu, Tray, nativeImage, Notification } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let localServer: http.Server | null = null;
let appOrigin = '';
// Set when the user explicitly quits (tray menu / app.quit); a plain window close only hides to tray.
let isQuitting = false;

const APP_ICON_PATH = path.join(__dirname, '../public/icon.png');
const WINDOW_STATE_FILE = 'window-state.json';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 820 };

function readWindowState(): WindowState {
  try {
    const file = path.join(app.getPath('userData'), WINDOW_STATE_FILE);
    if (!fs.existsSync(file)) return DEFAULT_WINDOW_STATE;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (typeof parsed?.width !== 'number' || typeof parsed?.height !== 'number') return DEFAULT_WINDOW_STATE;
    return { ...DEFAULT_WINDOW_STATE, ...parsed };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.isMaximized() ? (win as any).__lastNormalBounds || win.getNormalBounds() : win.getBounds();
    const state: WindowState = { ...bounds, isMaximized: win.isMaximized() };
    fs.writeFileSync(path.join(app.getPath('userData'), WINDOW_STATE_FILE), JSON.stringify(state), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist window state:', err);
  }
}

/**
 * Validate vault key against prototype pollution and invalid input
 */
export function isValidVaultKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.trim() === '') {
    return false;
  }
  const forbidden = ['__proto__', 'constructor', 'prototype'];
  if (forbidden.includes(key)) {
    return false;
  }
  return true;
}

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
      return Object.create(null);
    }
    const raw = fs.readFileSync(vaultPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const safeRecord: Record<string, string> = Object.create(null);
      for (const [k, v] of Object.entries(parsed)) {
        if (isValidVaultKey(k) && typeof v === 'string') {
          safeRecord[k] = v;
        }
      }
      return safeRecord;
    }
    return Object.create(null);
  } catch (err) {
    console.error('Failed to read vault file:', err);
    return Object.create(null);
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
  if (!isValidVaultKey(key) || typeof value !== 'string') {
    return false;
  }
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
  if (!isValidVaultKey(key)) {
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage encryption is not available on this system');
    return null;
  }
  try {
    const vault = readVault();
    const encoded = vault[key];
    if (!encoded || typeof encoded !== 'string') {
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
  if (!isValidVaultKey(key)) {
    return false;
  }
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
 * Protocol validation on shell.openExternal
 */
export function safeOpenExternal(rawUrl: string): void {
  try {
    const parsed = new URL(rawUrl);
    if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
      void shell.openExternal(rawUrl);
    }
  } catch {}
}

/**
 * Navigation restriction guard with strict origin and dev-port binding
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
    // In development mode, only allow explicitly configured loopback port 3000
    const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
    if (isDev) {
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (isLoopback && (parsed.port === '3000' || parsed.port === '')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.rsc': 'text/x-component; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolve local development or production server port with path-traversal defended file serving
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
    const appDir = path.resolve(__dirname, '..');
    const publicDir = path.resolve(appDir, 'public');
    const nextDir = path.resolve(appDir, '.next');
    const staticDir = path.resolve(nextDir, 'static');
    const serverAppDir = path.resolve(nextDir, 'server', 'app');

    localServer = http.createServer((req, res) => {
      const host = req.headers.host || '127.0.0.1';
      const reqUrl = new URL(req.url || '/', `http://${host}`);
      const pathname = decodeURIComponent(reqUrl.pathname);

      // Audit IP API endpoint
      if (pathname === '/api/audit-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ip: '127.0.0.1' }));
        return;
      }

      // Next.js static assets (CSS, JS chunks, media)
      if (pathname.startsWith('/_next/static/')) {
        const subPath = pathname.replace(/^\/_next\/static\//, '');
        // Strip leading separators and parent references so the join can never escape staticDir.
        const safeSubPath = path.normalize(subPath).replace(/^([/\\]|\.\.[/\\]?)+/, '');
        const staticFilePath = path.resolve(staticDir, safeSubPath);

        if (staticFilePath.startsWith(staticDir) && fs.existsSync(staticFilePath) && fs.statSync(staticFilePath).isFile()) {
          const ext = path.extname(staticFilePath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          });
          return fs.createReadStream(staticFilePath).pipe(res);
        }
      }

      // Public directory assets
      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const publicFilePath = path.resolve(publicDir, '.' + safePath);
      if (publicFilePath.startsWith(publicDir) && fs.existsSync(publicFilePath) && fs.statSync(publicFilePath).isFile()) {
        const ext = path.extname(publicFilePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        });
        return fs.createReadStream(publicFilePath).pipe(res);
      }

      // Next.js RSC payload handling
      const isRscRequest = reqUrl.searchParams.has('_rsc') || pathname.endsWith('.rsc');
      if (isRscRequest) {
        const cleanRoute = pathname.replace(/\.rsc$/, '').replace(/^\//, '').replace(/\/$/, '') || 'index';
        const rscFilePath = path.resolve(serverAppDir, `${cleanRoute}.rsc`);
        if (rscFilePath.startsWith(serverAppDir) && fs.existsSync(rscFilePath) && fs.statSync(rscFilePath).isFile()) {
          res.writeHead(200, {
            'Content-Type': 'text/x-component; charset=utf-8',
          });
          return fs.createReadStream(rscFilePath).pipe(res);
        }
      }

      // Next.js App Router HTML pages
      const route = pathname.replace(/^\//, '').replace(/\/$/, '') || 'index';
      let htmlFilePath = path.resolve(serverAppDir, `${route}.html`);
      if (!fs.existsSync(htmlFilePath) || !fs.statSync(htmlFilePath).isFile()) {
        htmlFilePath = path.resolve(serverAppDir, 'index.html');
      }

      if (fs.existsSync(htmlFilePath) && fs.statSync(htmlFilePath).isFile()) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(htmlFilePath).pipe(res);
      }

      // Fallback
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
    if (!isValidVaultKey(key) || typeof value !== 'string') {
      return false;
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
    if (!isValidVaultKey(key) || typeof value !== 'string') {
      return false;
    }
    return saveSecret(key, value);
  });

  ipcMain.handle('desktop:get-secret', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    if (!isValidVaultKey(key)) {
      return null;
    }
    return getSecret(key);
  });

  ipcMain.handle('safe-storage:decrypt', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    if (!isValidVaultKey(key)) {
      return null;
    }
    return getSecret(key);
  });

  ipcMain.handle('desktop:remove-secret', async (_event, ...args: any[]) => {
    const key = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && 'key' in args[0])
      ? args[0].key
      : args[0];
    if (!isValidVaultKey(key)) {
      return false;
    }
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

  ipcMain.handle('desktop:window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
      return true;
    }
    return false;
  });

  ipcMain.handle('desktop:window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return true;
    }
    return false;
  });

  ipcMain.handle('desktop:window-close', () => {
    if (mainWindow) {
      mainWindow.close();
      return true;
    }
    return false;
  });

  ipcMain.handle('desktop:window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('desktop:show-notification', (_event, ...args: any[]) => {
    const opts = (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) ? args[0] : {};
    if (!opts.title || typeof opts.title !== 'string') return false;
    try {
      const notif = new Notification({
        title: opts.title,
        body: typeof opts.body === 'string' ? opts.body : '',
        silent: Boolean(opts.silent),
        icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notif.show();
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Initialize Tray
 */
function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const iconPath = fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : path.join(__dirname, '../public/favicon.ico');
  if (fs.existsSync(iconPath)) {
    try {
      const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      tray = new Tray(icon);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Открыть Centras Chat', click: showMainWindow },
        { type: 'separator' },
        {
          label: 'Выйти из приложения',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]);
      tray.setToolTip('Centras Chat');
      tray.setContextMenu(contextMenu);
      tray.on('click', showMainWindow);
      tray.on('double-click', showMainWindow);
    } catch (e) {
      console.warn('Tray initialization failed:', e);
    }
  }
}

/**
 * Create hardened main browser window
 */
async function createWindow(): Promise<void> {
  const state = readWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    // Matches the web app's page background so there is no dark flash before first paint.
    backgroundColor: '#f3f4f6',
    title: 'Centras Chat',
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
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

  // Restrict child window creation and route external URLs safely to system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });

  // Restrict navigation away from allowed local origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedLocalUrl(url)) {
      event.preventDefault();
      safeOpenExternal(url);
    }
  });

  const startUrl = await resolveServerUrl();
  appOrigin = startUrl;

  await mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (state.isMaximized) mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('resize', () => mainWindow && saveWindowState(mainWindow));
  mainWindow.on('move', () => mainWindow && saveWindowState(mainWindow));

  // Messenger convention: closing the window keeps the app (and its notifications) alive in the tray.
  mainWindow.on('close', event => {
    if (mainWindow) saveWindowState(mainWindow);
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
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
    showMainWindow();
  });

  registerIpcHandlers();

  // Windows groups taskbar buttons and notifications by this id; it must match the installer appId.
  app.setAppUserModelId('com.centras.corporatechat');

  app.whenReady().then(async () => {
    // Frameless window draws its own titlebar; no native menu bar anywhere.
    Menu.setApplicationMenu(null);
    await createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showMainWindow();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
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
