import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Electron Security Hardening Invariants', () => {
  const mainPath = path.resolve(__dirname, '../electron/main.ts');
  const preloadPath = path.resolve(__dirname, '../electron/preload.ts');

  it('enforces hardened webPreferences flags in main.ts', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('nodeIntegration: false');
    expect(content).toContain('contextIsolation: true');
    expect(content).toContain('sandbox: true');
    expect(content).toContain('webSecurity: true');
  });

  it('restricts external navigation and window opening', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('setWindowOpenHandler');
    expect(content).toContain('openExternal');
    expect(content).toContain('will-navigate');
    expect(content).toMatch(/action:\s*['"]deny['"]/);
  });

  it('enforces single instance lock to prevent duplicate processes', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('app.requestSingleInstanceLock()');
    expect(content).toContain('second-instance');
  });

  it('disables DevTools in production environments', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('devtools-opened');
    expect(content).toContain('closeDevTools');
  });

  it('registers safeStorage DPAPI IPC handlers in main.ts', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('safe-storage:is-available');
    expect(content).toContain('desktop:save-secret');
    expect(content).toContain('desktop:get-secret');
    expect(content).toContain('desktop:remove-secret');
    expect(content).toContain('safeStorage.isEncryptionAvailable()');
    expect(content).toContain('safeStorage.encryptString');
    expect(content).toContain('safeStorage.decryptString');
  });

  it('registers utility IPC handlers for platform info, badge count, and ping', () => {
    expect(fs.existsSync(mainPath)).toBe(true);
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('desktop:get-platform-info');
    expect(content).toContain('desktop:set-badge-count');
    expect(content).toContain('desktop:ping-server');
  });

  it('exposes isolated desktopBridge in preload.ts without raw ipcRenderer leakage', () => {
    expect(fs.existsSync(preloadPath)).toBe(true);
    const content = fs.readFileSync(preloadPath, 'utf-8');

    expect(content).toContain('contextBridge.exposeInMainWorld');
    expect(content).toContain("'desktopBridge'");
    expect(content).toContain('isDesktop: true');
    expect(content).toContain('encryptAndSaveSecret');
    expect(content).toContain('getAndDecryptSecret');
    expect(content).toContain('removeSecret');
    expect(content).toContain('isEncryptionAvailable');

    // Ensure raw ipcRenderer is never exposed directly on window or bridge
    expect(content).not.toMatch(/desktopBridge.*ipcRenderer\b/);
    expect(content).not.toContain('exposeInMainWorld(\'ipcRenderer\'');
  });
});
