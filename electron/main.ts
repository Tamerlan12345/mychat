import { app, BrowserWindow, ipcMain, safeStorage, shell, Menu, Tray, nativeImage, Notification, clipboard, session } from 'electron';
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
 * Desktop preferences: autostart, tray behaviour, zoom. Stored as plain JSON in userData —
 * nothing here is secret, so it stays out of the DPAPI vault.
 */
const PREFERENCES_FILE = 'desktop-preferences.json';
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
const START_MINIMIZED_FLAG = '--start-minimized';

export interface DesktopPreferences {
  launchAtLogin: boolean;
  closeToTray: boolean;
  zoomFactor: number;
  trayHintShown: boolean;
}

const DEFAULT_PREFERENCES: DesktopPreferences = {
  launchAtLogin: false,
  closeToTray: true,
  zoomFactor: 1,
  trayHintShown: false,
};

export function sanitizePreferences(input: unknown): Partial<DesktopPreferences> {
  const out: Partial<DesktopPreferences> = {};
  if (typeof input !== 'object' || input === null) return out;
  const src = input as Record<string, unknown>;
  if (typeof src.launchAtLogin === 'boolean') out.launchAtLogin = src.launchAtLogin;
  if (typeof src.closeToTray === 'boolean') out.closeToTray = src.closeToTray;
  if (typeof src.trayHintShown === 'boolean') out.trayHintShown = src.trayHintShown;
  if (typeof src.zoomFactor === 'number' && Number.isFinite(src.zoomFactor)) {
    out.zoomFactor = Math.min(1.5, Math.max(0.8, Math.round(src.zoomFactor * 100) / 100));
  }
  return out;
}

function preferencesPath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILE);
}

function readPreferences(): DesktopPreferences {
  try {
    const file = preferencesPath();
    if (fs.existsSync(file)) {
      return { ...DEFAULT_PREFERENCES, ...sanitizePreferences(JSON.parse(fs.readFileSync(file, 'utf-8'))) };
    }
  } catch (err) {
    console.warn('Failed to read desktop preferences:', err);
  }
  return { ...DEFAULT_PREFERENCES };
}

function writePreferences(update: Partial<DesktopPreferences>): DesktopPreferences {
  const next = { ...readPreferences(), ...sanitizePreferences(update) };
  try {
    fs.writeFileSync(preferencesPath(), JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist desktop preferences:', err);
  }
  return next;
}

function applyLoginItem(enabled: boolean): void {
  // Registering the dev-time electron.exe as a login item would be wrong; only packaged builds qualify.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [START_MINIMIZED_FLAG] });
}

function setZoom(win: BrowserWindow, factor: number): void {
  const clamped = sanitizePreferences({ zoomFactor: factor }).zoomFactor ?? 1;
  win.webContents.setZoomFactor(clamped);
  writePreferences({ zoomFactor: clamped });
}

function stepZoom(win: BrowserWindow, direction: 1 | -1): void {
  const current = win.webContents.getZoomFactor();
  const idx = ZOOM_STEPS.findIndex(step => Math.abs(step - current) < 0.01);
  const nextIdx = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (idx === -1 ? 2 : idx) + direction));
  setZoom(win, ZOOM_STEPS[nextIdx]);
}

/**
 * Native right-click menu: Chromium gives frameless Electron windows none at all, so paste and
 * spelling corrections would otherwise be unreachable with the mouse.
 */
function attachContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      const suggestions = params.dictionarySuggestions.slice(0, 5);
      if (suggestions.length === 0) {
        template.push({ label: 'Нет вариантов исправления', enabled: false });
      }
      for (const suggestion of suggestions) {
        template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
      }
      template.push(
        {
          label: 'Добавить в словарь',
          click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      template.push(
        { label: 'Вырезать', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Копировать', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Вставить', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Выделить всё', role: 'selectAll' }
      );
    } else if (params.selectionText.trim()) {
      template.push({ label: 'Копировать', role: 'copy' });
    }

    if (params.linkURL) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push(
        { label: 'Открыть ссылку в браузере', click: () => safeOpenExternal(params.linkURL) },
        { label: 'Копировать адрес ссылки', click: () => clipboard.writeText(params.linkURL) }
      );
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });
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
      isPackaged: app.isPackaged,
      // Windows gets the OS-drawn caption buttons (titleBarOverlay); other platforms draw their own.
      hasNativeWindowControls: process.platform === 'win32',
    };
  });

  ipcMain.handle('desktop:set-badge-count', (_event, count: number) => {
    const badgeCount = typeof count === 'number' && count >= 0 ? Math.floor(count) : 0;
    if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(badgeCount);
    }
    tray?.setToolTip(badgeCount > 0 ? `Centras Chat · непрочитанных: ${badgeCount}` : 'Centras Chat');
    if (mainWindow && process.platform === 'win32' && badgeCount > 0 && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
    return true;
  });

  ipcMain.handle('desktop:get-preferences', () => readPreferences());

  ipcMain.handle('desktop:set-preferences', (_event, ...args: any[]) => {
    const update = sanitizePreferences(args[0]);
    const next = writePreferences(update);
    if (typeof update.launchAtLogin === 'boolean') {
      applyLoginItem(next.launchAtLogin);
    }
    if (typeof update.zoomFactor === 'number' && mainWindow) {
      mainWindow.webContents.setZoomFactor(next.zoomFactor);
    }
    return next;
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
    // On Windows the OS draws the caption buttons over our 36px titlebar (Snap Layouts, hover
    // animations and accessibility come for free); elsewhere the renderer draws its own buttons.
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: '#ffffff', symbolColor: '#6b7280', height: 36 },
        }
      : { frame: false }),
    // Matches the web app's page background so there is no dark flash before first paint.
    backgroundColor: '#f3f4f6',
    title: 'Centras Chat',
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  const startMinimized = process.argv.includes(START_MINIMIZED_FLAG);

  attachContextMenu(mainWindow);

  // Ctrl+= / Ctrl+- / Ctrl+0 — there is no application menu to provide the usual zoom accelerators.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!mainWindow || input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    if (input.key === '=' || input.key === '+') {
      event.preventDefault();
      stepZoom(mainWindow, 1);
    } else if (input.key === '-') {
      event.preventDefault();
      stepZoom(mainWindow, -1);
    } else if (input.key === '0') {
      event.preventDefault();
      setZoom(mainWindow, 1);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(readPreferences().zoomFactor);
  });

  const broadcastWindowState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('desktop:window-state-changed', { isMaximized: mainWindow.isMaximized() });
  };
  mainWindow.on('maximize', broadcastWindowState);
  mainWindow.on('unmaximize', broadcastWindowState);

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
    // Launched by Windows at login: stay in the tray until the user asks for the window.
    if (!startMinimized || !tray) mainWindow?.show();
  });

  mainWindow.on('resize', () => mainWindow && saveWindowState(mainWindow));
  mainWindow.on('move', () => mainWindow && saveWindowState(mainWindow));

  // Messenger convention: closing the window keeps the app (and its notifications) alive in the tray.
  mainWindow.on('close', event => {
    if (mainWindow) saveWindowState(mainWindow);
    const prefs = readPreferences();
    if (!isQuitting && tray && prefs.closeToTray) {
      event.preventDefault();
      mainWindow?.hide();
      if (!prefs.trayHintShown) {
        writePreferences({ trayHintShown: true });
        if (process.platform === 'win32') {
          tray.displayBalloon({
            iconType: 'info',
            title: 'Centras Chat продолжает работать',
            content:
              'Окно свёрнуто в область уведомлений, сообщения будут приходить. Чтобы выйти полностью — «Выйти из приложения» в меню значка. Поведение можно изменить в Настройках.',
          });
        }
      }
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
    try {
      session.defaultSession.setSpellCheckerLanguages(['ru', 'en-US']);
    } catch (err) {
      console.warn('Spellchecker languages unavailable:', err);
    }
    createTray();
    await createWindow();

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
