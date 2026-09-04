# PROJECT.md — Holding Corporate Chat

## Architecture
- **Type**: Web Application (Next.js 14 App Router, TypeScript, Tailwind CSS) + Standalone Windows Desktop Client (Electron 32, NSIS Installer, Windows DPAPI `safeStorage`).
- **Core Abstraction**: Layered Architecture strictly following Technical Specification §3:
  `UI` -> `Application Services` -> `Chat API` -> `Data Provider` -> `Supabase PostgreSQL / Realtime / Storage` (with seamless upgrade path to Matrix API / Synapse).
- **Zero-Trust Connection Architecture**: Desktop client connects over TLS to Supabase API endpoints (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) or in-memory mock fallback; automated build pipeline actively blocks database master credentials (`DATABASE_URL`, `service_role`).
- **Branding Engine**: Dynamic CSS Variables `:root` injection without full application rebuild.
- **Telegram Integration**: Server-only Telegram Bot API relay for account linking, direct-message notifications, and private text inbound relay.

## Module Registry
| Module | Path | Responsibility | Depends on | Depended on by |
|--------|------|----------------|------------|----------------|
| Types | `types/index.ts` | Data models & interfaces | None | All modules |
| Data Provider Abstraction | `lib/provider/data-provider.ts` | Backend contract for DB/API operations | Types | Services |
| Mock/Supabase Data Provider | `lib/provider/mock-provider.ts` | Core state manager & mock/Supabase implementation | Data Provider, Types | Services |
| Chat Service | `services/chat-service.ts` | DM, Group, Channel messaging & reactions | Data Provider | Chat UI |
| User Service | `services/user-service.ts` | Profiles, Directory, Status management | Data Provider | Contacts UI, Admin UI |
| Group Service | `services/group-service.ts` | Group & Channel management | Data Provider | Chat UI, Admin UI |
| Branding Service | `services/branding-service.ts` | Dynamic White-Label branding configuration | Data Provider | Theme Provider, Admin UI |
| Telegram Service | `services/telegram-service.ts` | Client-safe Telegram Bot API relay account/status/activity integration | Data Provider | Telegram UI |
| File Service | `services/file-service.ts` | File validation (max 50MB) and upload/download | Data Provider | Chat UI |
| Auth Context | `lib/auth/auth-context.tsx` | Authentication, RBAC checks & session state | User Service | Next Pages |
| Theme Provider | `components/ui/theme-provider.tsx` | Dynamic CSS variable `:root` injector | Branding Service | Root Layout |
| Electron Main Process | `electron/main.ts` | Desktop window lifecycle, single instance lock, DPAPI vault storage, ephemeral server | Electron, Node HTTP/FS | Next.js desktop client |
| Electron Preload Bridge | `electron/preload.ts` | Context isolation bridge exposing typed `window.desktopBridge` with whitelisted IPC | Electron `contextBridge` | Web UI / Desktop adapters |
| Secure Storage Adapter | `lib/desktop/secure-storage.ts` | DPAPI encrypted credential vault with web localStorage fallback | Desktop Bridge, Browser Storage | Connection Manager, Auth |
| Desktop Connection Manager | `lib/desktop/connection-manager.ts` | Dynamic server URL/key configuration, DPAPI persistence, health test | Secure Storage, Providers | Login UI, Settings UI, Server Dialog |
| Server Connection Dialog | `components/desktop/server-connection-dialog.tsx` | Modal dialog for runtime server URL & anon key configuration with connectivity test | Connection Manager | Login UI, Settings UI |

## Decisions Log
| # | Date | Decision | Context | Alternatives rejected | Reversal cost |
|---|------|----------|---------|-----------------------|---------------|
| 1 | 2026-08-10 | Data Provider Abstraction | Tech Spec §3 requires UI decoupling from Supabase for future Matrix migration | Direct Supabase client calls inside React components | Medium |
| 2 | 2026-08-10 | Dynamic Branding via CSS Root Variables | Tech Spec §20-21 requires branding updates without code rebuild | Rebuilding static bundles per client | Low |
| 3 | 2026-08-10 | In-Memory & LocalStorage Fallback Provider | Ensures instant standalone demo execution without mandatory external Supabase project keys | Hard dependency on live cloud credentials | Low |
| 4 | 2026-08-10 | Git Ignore Policy | Standardize ignored technical files (node_modules, .next, .superpowers, logs, env) | Committing build artifacts and secret keys | Low |
| 5 | 2026-08-11 | Real Supabase Provider Selected at Runtime via `resolveProviderMode()` | Tech Spec §3 requires a production-grade backend (real Postgres Auth/RLS/Realtime) while keeping the zero-config mock demo path working out of the box | Always requiring live Supabase credentials; a build-time flag instead of a runtime env check | Medium |
| 6 | 2026-09-04 | Electron + NSIS Standalone Installer | Desktop application distribution requires single-click/guided Windows installer with ASAR packaging, process isolation (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`), and background HTTP serving without external dependencies | Tauri (requires Rust toolchain and MSVC), PWA (lacks OS integration, single-instance lock, tray, hardware DPAPI), raw zip distribution | High |
| 7 | 2026-09-04 | Windows DPAPI SafeStorage Vault for Credentials | Corporate security requires enterprise-grade hardware/OS-level encryption for saved authentication tokens and Supabase keys on disk | Plaintext LocalStorage / unencrypted SQLite / native keytar C++ addon (fails on Node 24 due to ABI breakage) | Medium |
| 8 | 2026-09-04 | Zero-Trust Leak Detection in Automated Packaging | Prevent accidental embedding of server secrets (database passwords, `service_role` JWTs, bot tokens) into client desktop installer artifacts during automated builds | Manual pre-release checklist, trust-based environment separation without automated validation | Low |
| 9 | 2026-09-05 | Client-side Server Isolation & Admin-only Telegram Relay | Security policy requires that ordinary employees cannot view or modify database connection credentials; Telegram bot setup is strictly restricted to company administrators | Showing connection modals in employee profile settings, exposing server URLs on login screen | Low |
| 10 | 2026-09-05 | Removal of Channels & Streamlined Workspace Model | Eliminate the artificial complexity of public/broadcast channels for enterprise users in favor of focused Working Groups and Direct Messages | Maintaining confusing triple navigation (Channels, Groups, DMs) | Low |
| 11 | 2026-09-05 | Synthesized Web Audio API Chime & Dual Installer Strategy | Zero-asset client-side synthesized corporate audio notifications (Web Audio API) alongside native Windows push alerts; packaging both NSIS Wizard Setup and Portable single-file runner | Requiring external audio asset files (risk of missing asset / 404 in ASAR), single installation model | Low |

## Task Log
| # | Task | Mode | Status | Files | Goals satisfied (G1–G4) | Notes |
|---|------|------|--------|-------|--------------------------|-------|
| 1 | Project setup & Data Provider architecture | Feature | Completed | `types/index.ts`, `lib/provider/*`, `services/*` | G1, G2, G3, G4 | Core architecture established |
| 2 | Supabase Database Schema & Seed | Feature | Completed | `supabase/migrations/001_initial_schema.sql`, `supabase/seed.sql` | G2, G3, G4 | Production PostgreSQL schema |
| 3 | Auth & Dynamic Branding Engine | Feature | Completed | `lib/auth/*`, `services/branding-service.ts`, `components/ui/theme-provider.tsx` | G1, G2, G3 | Live CSS root variable updates |
| 4 | Chat UI & Realtime Messaging | Feature | Completed | `components/chat/*`, `components/sidebar/*` | G1, G2, G3 | DM, Groups, Channels, Reactions, Unread |
| 5 | Admin Panel & Audit Logs | Feature | Completed | `app/admin/*`, `components/admin/*` | G1, G2, G3, G4 | User management, RBAC, Branding editor |
| 6 | Telegram Bot API relay | Feature | Completed | `lib/telegram/*`, `app/api/telegram/*`, `supabase/migrations/003_telegram_bot_relay.sql`, `components/telegram/*` | G1, G2, G4 | Bot API linking, direct-message notifications, private text inbound relay, and retryable outbox; live credentials still require manual setup |
| 7 | Production Git Configuration | Refactor | Completed | `.gitignore` | G3, G4 | Exclusion of technical & temporary files |
| 8 | Backend Foundation — real Supabase provider (Auth, Postgres, Realtime) | Feature | Completed | `lib/provider/{index,supabase-client,supabase-provider}.ts`, `lib/auth/{index,auth-provider,mock-auth-provider,supabase-auth-provider}.ts`, `supabase/migrations/002_auth_and_rls.sql`, `app/api/audit-ip/route.ts`, `scripts/seed-supabase.ts`, `docs/SUPABASE_SETUP.md` | G1, G2, G3, G4 | `resolveProviderMode()` picks `mock` (zero-config, unchanged demo behavior) or `supabase` (real password auth, RLS-backed Postgres, Realtime broadcast) from `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`; `getDataProvider()`/`getAuthProvider()` factories wired into all 5 services + auth context; `SupabaseDataProvider` fully implements `IDataProvider` (35 members); RLS migration went through 2 fix rounds (privilege escalation, missing INSERT policy, member-bootstrap deadlock, audit-log RPC forgery — all closed). Mock provider files untouched (`mock-provider.ts`, `mock-auth-provider.ts` byte-identical since initial commit), so the zero-config demo path is unaffected. Full verification counts are recorded in `.superpowers/sdd/2026-08-11-telegram-bot-relay-plan/task-6-report.md`; real-Supabase manual pass not run — no project credentials in this session. |
| 9 | Secure Windows Desktop Application & Automated Installer (.exe) | Feature | Completed | `electron/*`, `lib/desktop/*`, `components/desktop/*`, `scripts/build-installer.ts`, `electron-builder.yml`, `docs/DESKTOP_INSTALLER.md` | G1, G2, G3, G4 | Hardened Electron shell (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`), Windows DPAPI `safeStorage` encryption for credentials, dynamic server connection wizard with cache invalidation, automated build pipeline with Zero-Trust leak detection, NSIS installer generation (`Centras Chat Setup 1.0.0.exe`, 118.5 MB), 189/189 tests passing. |
| 10 | UI Redesign, Groups Ergonomics & Server Isolation | Feature | Completed | `components/sidebar/*`, `components/chat/*`, `app/login/*`, `app/settings/*`, `components/admin/*`, `lib/provider/mock-provider.ts` | G1, G2, G3, G4 | Ergonomic workspace filters ("Все", "Группы", "Каналы", "Личные"), dedicated Groups section with inline creation, Telegram integration moved to Admin navigation, removal of server connection dialogs from employee UI (connection configuration fully isolated), dark enterprise theme with glassmorphism, updated installer (.exe) and live web server. |
| 11 | Channels Removal, Notifications Engine & Portable Windows Runner | Feature | Completed | `components/sidebar/*`, `components/chat/*`, `components/desktop/*`, `lib/notifications/*`, `electron/*`, `electron-builder.yml`, `app/globals.css` | G1, G2, G3, G4 | Completely removed channels in favor of focused working groups and DMs; implemented Web Audio API harmonic chime and native desktop push notifications; added frameless native Titlebar with window controls (minimize, maximize, close); generated both NSIS Setup and Portable `.exe` artifacts; 193/193 tests passing. |

## Known Issues & Technical Debt
| Issue | Severity | Location | Impact on G1 / G3 / G4 | Owner | Plan |
|-------|----------|----------|------------------------|-------|------|
| Live Telegram webhook, worker schedule, and BotFather credentials have not been exercised in this repository's automated sessions | Medium | `docs/TELEGRAM_SETUP.md`, `app/api/telegram/*` | G1/G4 | DevOps/QA | Apply migration 003, configure dedicated credentials, and complete the documented manual checks |
| Admin → Audit table reads `globalDataProvider` directly (no `AuditService`), bypassing the `getDataProvider()` factory | Medium | `components/admin/audit-table.tsx` | G3 — silently serves stale mock audit data forever in Supabase mode even though `SupabaseDataProvider.getAuditLogs()` is fully implemented | Backend | Add an `AuditService` wrapping `getDataProvider().getAuditLogs()` and rewire the table to it |
| Admin → Users "create user" throws in Supabase mode (profile-only insert isn't valid once real Supabase Auth owns signup) | Low | `components/admin/users-table.tsx`, `lib/provider/supabase-provider.ts` | G1/G3 — admin-invite flow for new users isn't implemented against real Supabase yet; caught and surfaced via `alert()` rather than silently failing | Backend | Implement an admin invite/signup flow against Supabase Auth (e.g. `supabase.auth.admin.inviteUserByEmail` via a server route) |
| Real Supabase mode (Auth, RLS, Realtime, seed script) has not been exercised end-to-end against a live project in this repo's automated sessions | Medium | `lib/provider/supabase-provider.ts`, `lib/auth/supabase-auth-provider.ts`, `supabase/migrations/002_auth_and_rls.sql` | G2/G3 — correctness relies on unit/mocked tests + code review only, not a live Postgres/Realtime run | DevOps/QA | Run `docs/SUPABASE_SETUP.md`'s setup + `npm run seed:supabase` against a real project and complete Task 16 Step 3's manual pass (password rejection, persistence-after-refresh, cross-window Realtime, branding broadcast) |
| `npm run lint` (`next lint`) has no ESLint config in the repo (none since the initial commit) and prompts interactively for setup, which hangs/no-ops in a non-interactive shell | Low | repo root (no `.eslintrc*` / `eslint.config.*`) | G4 — no automated lint signal in CI/local non-interactive runs; pre-existing, not introduced by this plan | DevOps | Run `next lint` once interactively (or commit a generated `eslint.config.mjs`) to pin a config |

## Build & Test Commands
- `npm run dev`: Launch local Next.js development server
- `npm run build`: Production build compilation (Verified 2026-09-05: Next.js 14.2.35, all 17 routes compiled clean)
- `npm run test`: Vitest suite (Verified 2026-09-05: 189 tests passing, 0 failures, 9 skipped integration tests)
- `npm run desktop:compile`: Compile Electron TypeScript main & preload files to `dist-electron/` (`tsc -p electron/tsconfig.json`)
- `npm run desktop:dev`: Launch local Next.js dev server concurrently with Electron desktop client
- `npm run desktop:build`: Full desktop build (`next build` + `tsc -p electron/tsconfig.json`)
- `npm run build:installer`: Automated desktop packaging pipeline with Zero-Trust leak scan, compiler execution, and NSIS `.exe` generation
- `npm run lint`: not currently runnable non-interactively — see Known Issues (no ESLint config in repo)
- `npm run seed:supabase`: seeds a real Supabase project per `docs/SUPABASE_SETUP.md` (requires `.env.local` with project credentials, not available in automated sessions)
