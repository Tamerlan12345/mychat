# Centras Chat — Desktop Application & Windows Installer Guide

This document outlines the architecture, build pipeline, security guardrails, and administrator deployment instructions for the **Centras Chat** Windows desktop client.

---

## 1. Overview & Architecture

Centras Chat provides a dedicated, native Windows desktop client built with **Electron 32** encapsulating the **Next.js 14** application. The desktop package is distributed as a standalone Windows installer (`.exe`) generated via **NSIS** (Nullsoft Scriptable Install System) using `electron-builder`.

### Key Architectural Characteristics
- **Hardened Process Model:** The Electron main process enforces strict process isolation (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`).
- **Bridge-Mediated IPC:** The renderer window accesses native desktop capabilities solely via a whitelisted, strongly typed `window.desktopBridge` context bridge.
- **Hardware-Backed Session Security:** Sensitive authentication tokens and user credentials are encrypted on disk via **Windows DPAPI** (`safeStorage`).
- **Zero-Trust Client Packaging:** No administrative database credentials or server secrets are ever packaged into the installer.

---

## 2. Environment Configuration & Zero-Trust Boundary

When compiling the desktop installer, environment variables are loaded in the following priority order:
1. `.env.production.local` (highest priority)
2. `.env.production`
3. `.env.local`
4. `.env`

### Public Client Variables (Allowed)
The following variables are the **only** environment parameters permitted in client-distributed binaries:
- `NEXT_PUBLIC_SUPABASE_URL`: The public HTTPS endpoint of your Supabase / PostgreSQL backend (e.g. `https://xyzcompany.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: The public anonymous key. This key allows public gateway access governed strictly by PostgreSQL **Row Level Security (RLS)** policies.

> [!NOTE]
> If neither variable is configured at build time, the application compiles in **standalone mock/demo mode**. Users or administrators can later configure live server parameters dynamically using the in-app **Server Connection Wizard**.

### Server-Only Secrets (Forbidden in Client Builds)
The following variables must **never** have a `NEXT_PUBLIC_` prefix and are strictly forbidden from the client installer:
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` / direct PostgreSQL connection strings
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_WORKER_SECRET`

### Automated Zero-Trust Security Scan
Before any compilation begins, `scripts/build-installer.ts` executes an automated **Zero-Trust Credential Leak Scan**:
1. **Name Inspection:** Fails immediately if any `NEXT_PUBLIC_*` variable contains `SECRET`, `PASSWORD`, `SERVICE_ROLE`, or `PRIVATE_KEY`.
2. **Pattern Matching:** Inspects all public values for `service_role`, `postgres://`, `postgresql://`, and RSA/EC private key headers.
3. **JWT Deep Inspection:** Safely parses and decodes the payload of any JWT in public variables; if `role === "service_role"` is detected, the build is instantly aborted.
4. **Secret Parity Check:** Compares public values against known server environment secrets to prevent accidental credential reuse.

---

## 3. Building the Desktop Installer

### Prerequisites
- Windows 10/11 x64 build environment
- Node.js 18+ (tested through Node.js 24)
- Project dependencies installed (`npm install`)

### Automated Build Command
To run the full automated packaging pipeline:
```bash
npm run build:installer
```

### Build Flags
You can pass custom arguments to the build script:

| Flag | Description | Use Case |
|------|-------------|----------|
| `--dir` | Packages an unpacked folder (`dist-installer/win-unpacked/`) without generating the single-file NSIS `.exe`. | Fast local developer smoke testing (~15 seconds). |
| `--dry-run` | Validates environment, executes Zero-Trust scan, and prints the build plan without running compilers. | CI pre-flight checks and configuration audits. |
| `--skip-next` | Skips Next.js compilation, reusing existing `.next/` build artifacts. | Iterating on Electron main/preload changes. |
| `--skip-electron` | Skips TypeScript compilation for `electron/main.ts` and `preload.ts`. | Iterating on web assets only. |
| `--help` | Prints the CLI help message. | Command reference. |

**Example:**
```bash
# Fast unpacked build for testing
npx tsx scripts/build-installer.ts --dir

# Dry-run configuration test
npx tsx scripts/build-installer.ts --dry-run
```

### Pipeline Execution Steps
1. **Step 0 — Environment Resolution:** Discovers and loads `.env.production` / `.env.local`.
2. **Step 1 — Zero-Trust Security Scan:** Validates all `NEXT_PUBLIC_*` variables against secret leakage.
3. **Step 2 — Directory Assurance:** Ensures `public/`, `build/`, `dist-electron/`, and `dist-installer/` directories exist.
4. **Step 3 — Next.js Production Build:** Compiles optimized App Router static assets and server bundles (`npx next build`).
5. **Step 4 — Electron Compilation:** Transpiles `electron/main.ts` and `electron/preload.ts` into CommonJS in `dist-electron/` (`npx tsc -p electron/tsconfig.json`).
6. **Step 5 — Electron-Builder Packaging:** Bundles assets into ASAR format (excluding `.next/cache/**`), attaches Windows icons and metadata, and generates the NSIS installer.
7. **Step 6 — Artifact Verification:** Scans `dist-installer/`, calculates exact file size in MB and computing a cryptographic **SHA-256 checksum**.

---

## 4. Windows NSIS Installer Specification

The resulting setup executable is saved in `dist-installer/`:
```text
dist-installer/
├── Centras Chat Setup 1.0.0.exe             # Standalone NSIS installer
├── Centras Chat Setup 1.0.0.exe.blockmap    # Differential update map
└── win-unpacked/                            # Unpacked binaries (when using --dir)
```

### Installer Capabilities
- **Per-User Installation (`perMachine: false`):** Installs into `%LOCALAPPDATA%\Programs\corporate-chat` without requiring Windows Administrator UAC elevation.
- **Custom Directory Selection (`oneClick: false`):** Allows users or administrators to specify a custom installation directory.
- **Shortcuts:** Automatically creates desktop and Start Menu shortcuts ("Centras Chat").
- **Clean Uninstallation:** Registers with Windows **Control Panel > Programs and Features** and Windows 10/11 **Settings > Installed apps**.

### Enterprise Silent Deployment
Enterprise administrators can deploy the installer across managed endpoints using standard NSIS command-line switches:
```cmd
:: Silent installation for the current user
"Centras Chat Setup 1.0.0.exe" /S

:: Silent installation with custom destination path
"Centras Chat Setup 1.0.0.exe" /S /D=C:\CorporateApps\CentrasChat
```

---

## 5. Security In-Depth Architecture

### Windows DPAPI (`safeStorage`) Local Encryption
Standard web applications store user sessions in plaintext browser `localStorage`. In Centras Chat:
1. When running inside the desktop shell, session tokens and user credentials are routed to `desktopBridge.encryptAndSaveSecret(key, value)`.
2. The Electron main process encrypts the data using **Windows Data Protection API (DPAPI)** via `safeStorage.encryptString()`.
3. The ciphertext is stored in `%APPDATA%\Centras Chat\secure-vault.json`.
4. **Hardware/User Bound:** DPAPI encryption keys are tied to the current Windows user account and the local machine's TPM. Even if an attacker copies the `secure-vault.json` file to another computer, they cannot decrypt the stored tokens.

### Electron Security Flags
The desktop shell strictly configures `webPreferences`:
- `nodeIntegration: false`: Prohibits renderer access to Node.js APIs.
- `contextIsolation: true`: Prevents renderer scripts from modifying or accessing preload prototypes.
- `sandbox: true`: Runs rendering processes in an OS-level restricted sandbox.
- `webSecurity: true`: Enforces Same-Origin Policy.
- `shell.openExternal`: Intercepts external navigation requests and routes them to the user's default OS browser instead of opening within the app frame.

---

## 6. Runtime Server Reconfiguration

If an organization migrates to a new Supabase endpoint or changes its public gateway:
1. Launch Centras Chat.
2. Click the **"Сервер"** button on the Login page (or navigate to **Настройки > Подключение к серверу**).
3. Enter the new **URL сервера** and **Anon Key**.
4. Click **"Проверить связь"** to test connectivity.
5. Click **"Сохранить и применить"**. The application stores the updated endpoint securely in DPAPI vault storage and reinitializes provider connections without requiring a client reinstallation.

---

## 7. Troubleshooting & FAQ

### Issue: `Cannot create symbolic link` during winCodeSign download
- **Cause:** When `electron-builder` extracts the `winCodeSign` archive, standard Windows user accounts without Developer Mode cannot unpack macOS `.dylib` symlinks.
- **Resolution:**
  1. Locate the downloaded archive in `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\`.
  2. Extract it using 7-Zip excluding macOS files:
     ```powershell
     & 'node_modules\7zip-bin\win\x64\7za.exe' x -bd -xr!darwin "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\<id>.7z" "-o%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
     ```
  3. Re-run `npm run build:installer`. `electron-builder` will detect the cached folder and proceed cleanly.

### Issue: `[FATAL SECURITY ERROR] ZERO-TRUST SCAN FAILED`
- **Cause:** A variable starting with `NEXT_PUBLIC_` contains a forbidden pattern (such as `service_role`, `postgres://`, or database passwords).
- **Resolution:**
  - Check `.env.production` and `.env.local`.
  - Remove administrative secrets from any variable prefixed with `NEXT_PUBLIC_`.
  - Ensure administrative keys (e.g. `SUPABASE_SERVICE_ROLE_KEY`) do not have the `NEXT_PUBLIC_` prefix.

### Clean Rebuild Reset
If stale build caches cause packaging discrepancies, run:
```powershell
Remove-Item -Recurse -Force dist-installer, dist-electron, .next
npm run build:installer
```

## 8. Web ↔ Desktop Parity

The desktop client renders the same Next.js build the web version serves, so the two look identical by construction. The pieces that live only in the shell are kept in sync as follows:

- **Icon set** — `npm run icons` regenerates `public/favicon.ico`, `public/icon*.png` (web favicon, PWA manifest, tray, native notifications) and `resources/icon.ico` (installer, uninstaller, `.exe`) from one vector description in `scripts/generate-icons.mjs`. Commit the generated files; `electron-builder.yml` reads `resources/`.
- **Window chrome** — the frameless window paints `#f3f4f6` (the app's page background) before first render, starts at 1280×820 (min 1024×680) and remembers its last size/position in `%APPDATA%/corporate-chat/window-state.json (the userData folder is named after package.json `name`)`. The custom titlebar shows the same brand and «Защищённое соединение» badge on both platforms; window controls appear only under Electron.
- **Tray behaviour** — closing the window hides the app to the tray so notifications keep arriving; «Выйти из приложения» in the tray menu (or `before-quit`) really exits. Clicking a native notification or the tray icon brings the window back.
- **Installer** — NSIS wizard in Russian (English fallback), per-user install, desktop + Start-menu shortcuts named «Centras Chat», artifacts `Centras-Chat-Setup-<version>.exe` and `Centras-Chat-Portable-<version>.exe`.
- **Web install** — `public/manifest.webmanifest` lets browsers offer “Install Centras Chat” with the same icon and theme colour, giving a windowed experience close to the desktop build without the installer.
