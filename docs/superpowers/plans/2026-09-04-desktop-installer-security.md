# Desktop Installer & Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Centras Chat into a secure Windows desktop application with an automated `.exe` installer (NSIS), Windows DPAPI encrypted storage for sessions/credentials, hardened process isolation, and automated packaging from `.env`.

**Architecture:** Electron desktop shell wrapping the Next.js production build, enforcing `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Preload exposes a typed `desktopBridge` communicating via IPC with the main process. Sensitive tokens are encrypted using Windows DPAPI (`safeStorage`). `electron-builder` packages the application into a standalone NSIS installer executable.

**Tech Stack:** Next.js 14, TypeScript, Electron, electron-builder, Windows DPAPI (`safeStorage`), Vitest.

## Global Constraints

- No database master credentials (`DATABASE_URL`, `service_role`) in client artifacts; only public endpoint URL and anon key.
- All existing 151 unit and integration tests must continue to pass without regression.
- Node.js 24 compatibility: build without native C++/Rust compilation steps.
- Security flags `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` must be strictly enforced.

---

### Task 1: Desktop Dependencies & Packaging Configuration

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`
- Create: `electron/tsconfig.json`

**Interfaces:**
- Consumes: Existing project dependencies.
- Produces: `package.json` scripts (`desktop:dev`, `desktop:build`, `build:installer`) and `electron-builder.yml` NSIS configuration.

- [ ] **Step 1: Install dev dependencies for Electron & electron-builder**

Run command:
```powershell
npm install --save-dev electron@^32.0.0 electron-builder@^25.0.0 concurrently@^9.0.0 cross-env@^7.0.3 wait-on@^8.0.0
```

- [ ] **Step 2: Create `electron/tsconfig.json`**

Create `electron/tsconfig.json` with target Node/CommonJS for Electron main/preload processes:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "../dist-electron",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["./**/*"]
}
```

- [ ] **Step 3: Create `electron-builder.yml`**

Configure NSIS installer generation, shortcuts, ASAR packaging, and output paths:
```yaml
appId: com.centras.corporatechat
productName: Centras Chat
directories:
  output: dist-installer
  buildResources: build
files:
  - dist-electron/**/*
  - .next/**/*
  - public/**/*
  - package.json
  - node_modules/**/*
win:
  target:
    - target: nsis
      arch:
        - x64
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Centras Chat
  uninstallDisplayName: Centras Corporate Chat
asar: true
```

- [ ] **Step 4: Update `package.json` scripts**

Add scripts to `package.json`:
- `"desktop:compile"`: `"tsc -p electron/tsconfig.json"`
- `"desktop:dev"`: `"concurrently -k \"next dev\" \"wait-on http://127.0.0.1:3000 && electron .\""`
- `"desktop:build"`: `"next build && tsc -p electron/tsconfig.json"`
- `"build:installer"`: `"tsx scripts/build-installer.ts"`

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add package.json electron/tsconfig.json electron-builder.yml
git commit -m "chore: add electron and installer packaging configuration"
```

---

### Task 2: Hardened Electron Main Process & Preload Bridge

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Test: `tests/electron-security.test.ts`

**Interfaces:**
- Consumes: Node.js, Electron `app`, `BrowserWindow`, `ipcMain`, `safeStorage`, `shell`.
- Produces: Hardened desktop window, Windows DPAPI safeStorage handlers, and typed `window.desktopBridge`.

- [ ] **Step 1: Write test for desktop security invariants**

Create `tests/electron-security.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Electron Security Hardening Invariants', () => {
  it('enforces nodeIntegration: false, contextIsolation: true, and sandbox: true in main.ts', () => {
    const mainPath = path.resolve(__dirname, '../electron/main.ts');
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('nodeIntegration: false');
    expect(content).toContain('contextIsolation: true');
    expect(content).toContain('sandbox: true');
    expect(content).toContain('webSecurity: true');
  });

  it('blocks navigation to external origins and routes through shell.openExternal', () => {
    const mainPath = path.resolve(__dirname, '../electron/main.ts');
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('setWindowOpenHandler');
    expect(content).toContain('openExternal');
    expect(content).toContain('will-navigate');
  });

  it('registers safeStorage DPAPI IPC handlers in main.ts', () => {
    const mainPath = path.resolve(__dirname, '../electron/main.ts');
    const content = fs.readFileSync(mainPath, 'utf-8');

    expect(content).toContain('safe-storage:encrypt');
    expect(content).toContain('safe-storage:decrypt');
    expect(content).toContain('safeStorage.isEncryptionAvailable()');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/electron-security.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `electron/main.ts`**

Create `electron/main.ts` with:
- Single instance lock (`app.requestSingleInstanceLock()`).
- Ephemeral local production server or Next.js dev URL loading.
- DPAPI encryption IPC (`safeStorage.encryptString`, `safeStorage.decryptString`).
- External link lockdown (`shell.openExternal`).
- System tray with context menu and unread badge.
- Secure HTTP server for local bundle serving in production.

- [ ] **Step 4: Implement `electron/preload.ts`**

Create `electron/preload.ts` with `contextBridge.exposeInMainWorld('desktopBridge', ...)` providing strictly validated IPC calls.

- [ ] **Step 5: Run tests and compile Electron scripts**

Run:
```powershell
npx vitest run tests/electron-security.test.ts
npm run desktop:compile
```
Expected: PASS.

- [ ] **Step 6: Commit Task 2 changes**

```bash
git add electron/main.ts electron/preload.ts tests/electron-security.test.ts
git commit -m "feat: implement hardened electron main process and preload bridge"
```

---

### Task 3: Windows DPAPI Secure Storage Adapter

**Files:**
- Create: `lib/desktop/types.ts`
- Create: `lib/desktop/secure-storage.ts`
- Modify: `types/index.ts`
- Test: `lib/desktop/secure-storage.test.ts`

**Interfaces:**
- Consumes: `window.desktopBridge` when present, browser `localStorage` as fallback.
- Produces: `SecureStorage` interface with `setItem(key, value)`, `getItem(key)`, `removeItem(key)`.

- [ ] **Step 1: Write test for SecureStorage**

Create `lib/desktop/secure-storage.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureStorage } from './secure-storage';

describe('SecureStorage', () => {
  beforeEach(() => {
    delete (globalThis as any).window;
  });

  it('delegates to desktopBridge when running in Electron with DPAPI', async () => {
    const mockBridge = {
      isDesktop: true,
      encryptAndSaveSecret: vi.fn().mockResolvedValue(true),
      getAndDecryptSecret: vi.fn().mockResolvedValue('decrypted-jwt-token'),
      removeSecret: vi.fn().mockResolvedValue(true),
    };
    (globalThis as any).window = { desktopBridge: mockBridge };

    const storage = new SecureStorage();
    await storage.setItem('auth_token', 'my-secret-token');
    expect(mockBridge.encryptAndSaveSecret).toHaveBeenCalledWith('auth_token', 'my-secret-token');

    const val = await storage.getItem('auth_token');
    expect(val).toBe('decrypted-jwt-token');
  });

  it('falls back to memory storage in headless/node environments without crashing', async () => {
    const storage = new SecureStorage();
    await storage.setItem('key', 'val');
    expect(await storage.getItem('key')).toBe('val');
    await storage.removeItem('key');
    expect(await storage.getItem('key')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/desktop/secure-storage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/desktop/types.ts` and `lib/desktop/secure-storage.ts`**

Define `DesktopBridge` interface and implement `SecureStorage` with DPAPI hardware encryption delegation and safe fallbacks.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/desktop/secure-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Task 3 changes**

```bash
git add lib/desktop/types.ts lib/desktop/secure-storage.ts lib/desktop/secure-storage.test.ts
git commit -m "feat: implement DPAPI-backed secure storage adapter"
```

---

### Task 4: Server Connection Wizard & Dynamic Config Manager

**Files:**
- Create: `lib/desktop/connection-manager.ts`
- Modify: `lib/provider/index.ts`
- Modify: `lib/auth/index.ts`
- Create: `components/desktop/server-connection-dialog.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/settings/page.tsx`
- Test: `lib/desktop/connection-manager.test.ts`

**Interfaces:**
- Consumes: `SecureStorage`, `resolveProviderMode`.
- Produces: `ConnectionManager` with dynamic server URL and anon key persistence, connection health test, and UI dialog.

- [ ] **Step 1: Write test for ConnectionManager**

Create `lib/desktop/connection-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager } from './connection-manager';

describe('ConnectionManager', () => {
  it('retrieves default configuration from environment when no custom config is stored', async () => {
    const mgr = new ConnectionManager();
    const config = await mgr.getActiveConfig();
    expect(config).toBeDefined();
  });

  it('validates server URL format before saving', async () => {
    const mgr = new ConnectionManager();
    await expect(mgr.saveConfig({ serverUrl: 'invalid-url', anonKey: 'abc' })).rejects.toThrow();
  });

  it('saves valid configuration and allows retrieval', async () => {
    const mgr = new ConnectionManager();
    await mgr.saveConfig({ serverUrl: 'https://example.supabase.co', anonKey: 'eyJhbGciOi...' });
    const config = await mgr.getActiveConfig();
    expect(config.serverUrl).toBe('https://example.supabase.co');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/desktop/connection-manager.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/desktop/connection-manager.ts`**

Implement `ConnectionManager` with URL validation, health check ping, and integration with `SecureStorage`.
Update `lib/provider/index.ts` and `lib/auth/index.ts` to allow resetting/reconfiguring cached providers dynamically.

- [ ] **Step 4: Implement `components/desktop/server-connection-dialog.tsx`**

Create the modal dialog allowing users and admins to configure Server URL and Anon Key, test connection status, and save or reset.
Connect this dialog to `app/login/page.tsx` (a "Сервер" button in the corner) and `app/settings/page.tsx`.

- [ ] **Step 5: Run tests to verify they pass**

Run:
```powershell
npx vitest run lib/desktop/connection-manager.test.ts
npm run test
```
Expected: PASS (all tests passing).

- [ ] **Step 6: Commit Task 4 changes**

```bash
git add lib/desktop/connection-manager.ts lib/desktop/connection-manager.test.ts lib/provider/index.ts lib/auth/index.ts components/desktop/server-connection-dialog.tsx app/login/page.tsx app/settings/page.tsx
git commit -m "feat: implement server connection manager and configuration dialog"
```

---

### Task 5: Automated Installer Build Script & Packaging Pipeline

**Files:**
- Create: `scripts/build-installer.ts`
- Modify: `package.json`
- Create: `docs/DESKTOP_INSTALLER.md`

**Interfaces:**
- Consumes: `.env.production` / `.env.local`, `next build`, `tsc -p electron/tsconfig.json`, `electron-builder`.
- Produces: `dist-installer/CentrasChat-Setup-<version>.exe`.

- [ ] **Step 1: Implement `scripts/build-installer.ts`**

Create `scripts/build-installer.ts`:
- Reads `.env.production` or `.env.local` to verify public server parameters.
- Runs `next build` to compile the production web assets.
- Runs TypeScript compilation for `electron/main.ts` and `electron/preload.ts`.
- Invokes `electron-builder` programmatically or via CLI with Windows NSIS target.
- Verifies and outputs the resulting `.exe` installer path and file size.

- [ ] **Step 2: Create `docs/DESKTOP_INSTALLER.md`**

Document how to build the installer, how `.env` variables are baked in securely, how NSIS installation works on client machines, and how security in depth is maintained.

- [ ] **Step 3: Test the compilation steps**

Run:
```powershell
npm run desktop:compile
npm run build
```
Verify that `dist-electron/` and `.next/` are generated without errors.

- [ ] **Step 4: Commit Task 5 changes**

```bash
git add scripts/build-installer.ts docs/DESKTOP_INSTALLER.md package.json
git commit -m "feat: add automated installer build script and documentation"
```

---

### Task 6: Full Verification & Security Audit

**Files:**
- Modify: `PROJECT.md`

- [ ] **Step 1: Run complete test suite**

Run: `npm run test`
Expected: 100% pass across all test suites.

- [ ] **Step 2: Run production Next.js and Electron builds**

Run:
```powershell
npm run build
npm run desktop:compile
```
Expected: Exit code 0, 0 build errors.

- [ ] **Step 3: Run installer packaging test**

Run:
```powershell
npm run build:installer
```
Verify output file exists in `dist-installer/`.

- [ ] **Step 4: Update PROJECT.md**

Update Architecture, Module Registry, Decisions Log, and Task Log in `PROJECT.md`.

- [ ] **Step 5: Commit and tag completion**

```bash
git add PROJECT.md
git commit -m "docs: update PROJECT.md for desktop client and secure installer"
```
