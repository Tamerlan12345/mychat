# Secure Corporate Desktop Application & Windows Installer — Design Document

Date: 2026-09-04
Status: Approved for planning

## 1. Goals & System Objectives

- **G1 (Product Goal):** Provide a standalone, secure Windows desktop application with an automated `.exe` installer (NSIS), freeing corporate chat from the browser/widget context while enabling direct, authenticated connection to a live server and PostgreSQL database.
- **G2 (Engineering Goal):** Embed an Electron desktop container with a hardened security posture (contextIsolation, disabled nodeIntegration, sandbox, CSP, external link filtering), provide Windows DPAPI (`safeStorage`) encrypted session storage, and support `.env`-driven automated installer generation alongside a runtime connection wizard.
- **G3 (Quality Goal):** Produce a single-command build pipeline generating a fully functional NSIS `.exe` installer; ensure graceful degradation when the server is offline or unreachable; retain backward compatibility with the existing Next.js architecture.
- **G4 (Security & Integrity Goal):** Implement Zero-Trust client architecture — no database root or service_role credentials in the client binary; restrict database access via PostgreSQL Row Level Security (RLS); secure IPC communication via `contextBridge`; protect session tokens on disk using Windows DPAPI; package binaries with ASAR and disable DevTools in release builds.

## 2. Threat Model & Security Architecture (STRIDE Pass)

### 2.1 Credential Boundary (Zero-Trust)
- **Database Secrets:** Master database credentials (`DATABASE_URL`, direct connection strings, `service_role` administrative keys) remain strictly on the server. They are never included in the installer, frontend source, or build artifacts.
- **Client Configuration:** Only the public gateway URL (`NEXT_PUBLIC_SUPABASE_URL`) and public anonymous key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) are bundled into the client via `.env.production` during the build.
- **Server-Side Enforcement:** Access to PostgreSQL tables (`messages`, `profiles`, `conversations`) is governed strictly by Postgres Row Level Security (RLS). An unauthenticated client or decompiled binary cannot read or mutate records without a valid cryptographic JWT signed by the authentication provider.

### 2.2 Local Storage Security (Windows DPAPI)
- Web browsers store session tokens in plaintext `localStorage`, vulnerable to malware or unprivileged file access.
- In the desktop application, session tokens, refresh tokens, and user credentials are encrypted via Electron's `safeStorage` API using Windows Data Protection API (DPAPI).
- The encryption key is tied to the current Windows user profile and hardware security provider (TPM). An attacker copying the session file to another computer cannot decrypt the contents.

### 2.3 Process Isolation & Hardening
- `webPreferences`:
  - `nodeIntegration: false` (strictly prevents renderer execution of Node.js primitives).
  - `contextIsolation: true` (ensures renderer scripts cannot alter or inspect preload internals).
  - `sandbox: true` (OS-level sandboxing for the rendering process).
  - `webSecurity: true` (enforces same-origin policy).
- **Navigation Lock:** All `will-navigate` and `setWindowOpenHandler` events are trapped. External links are dispatched to the user's default OS browser via `shell.openExternal`; renderer navigation to unauthorized remote origins is blocked.
- **DevTools & Debugging:** Developer tools are disabled in production builds.

## 3. Desktop Architecture & Components

### 3.1 Main Process (`electron/main.ts`)
- Manages native Windows lifecycle: single instance lock (`requestSingleInstanceLock`), system tray with context menu, minimize-to-tray, and unread notification badges.
- Exposes safe IPC handlers for DPAPI encryption/decryption, server health ping, and window management.

### 3.2 Preload Script & Bridge (`electron/preload.ts`)
- Exposes a typed, validated `window.desktopBridge` through `contextBridge`:
  ```typescript
  interface DesktopBridge {
    isDesktop: boolean;
    getPlatform: () => Promise<string>;
    encryptAndSaveSecret: (key: string, value: string) => Promise<boolean>;
    getAndDecryptSecret: (key: string) => Promise<string | null>;
    removeSecret: (key: string) => Promise<boolean>;
    pingServer: (url: string) => Promise<{ ok: boolean; status: number }>;
    setNotificationBadge: (count: number) => Promise<void>;
  }
  ```

### 3.3 Server Connection Wizard & Provider Adapter (`lib/desktop/connection-manager.ts`)
- Evaluates server availability on launch.
- If pre-configured in `.env.production`, uses bundled server parameters as defaults.
- If the server is unreachable or unconfigured, presents a modal/wizard allowing the user or network administrator to specify the Corporate Server URL and Public Anon Key.
- Integrates with `lib/provider/index.ts` and `lib/auth/index.ts` to switch dynamically between live Supabase/PostgreSQL mode and fallback demo mode.

## 4. Build Pipeline & Installer Specification

### 4.1 Packaging Toolchain
- Tool: `electron-builder`
- Target: Windows NSIS Installer (`.exe`)
- Artifact output: `dist/CentrasChat-Setup-<version>.exe`

### 4.2 Installer Configuration (`electron-builder.yml`)
- `oneClick: false`: Provides user control over destination directory.
- `perMachine: false`: Enables non-admin user installation without UAC barriers, with an option for all-users elevation.
- `createDesktopShortcut: true`, `createStartMenuShortcut: true`.
- Native uninstaller integration with Windows Control Panel / Settings.
- ASAR packaging enabled (`asar: true`) with integrity validation.

### 4.3 Build Scripts (`package.json`)
- `npm run desktop:dev`: Concurrently launches Next.js dev server and Electron in development mode.
- `npm run desktop:build`: Compiles Next.js production build and transfiles Electron main/preload TypeScript.
- `npm run build:installer`: Full automated pipeline taking `.env.production` (or `.env.local`), compiling the application, and invoking `electron-builder` to produce the final signed/ready `.exe` setup package.

## 5. Verification Plan

1. **Packaging Verification:**
   - Execute `npm run build:installer`.
   - Verify that `dist/` contains the generated `.exe` installer.
2. **Security & Sandbox Verification:**
   - Verify in Electron main process that `nodeIntegration` is `false`, `contextIsolation` is `true`, and `sandbox` is `true`.
   - Test external link click: verify URL opens in external default browser, not within app window.
3. **DPAPI Storage Verification:**
   - Test `encryptAndSaveSecret` followed by `getAndDecryptSecret` to verify data round-trip and encryption validity.
4. **Server Connection Wizard Verification:**
   - Test launching with valid server credentials and testing health ping.
   - Test offline/unreachable fallback path.
