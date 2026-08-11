# PROJECT.md — Holding Corporate Chat

## Architecture
- **Type**: Web Application (Next.js 14 App Router, TypeScript, Tailwind CSS) + Desktop Client Readiness (Tauri layer).
- **Core Abstraction**: Layered Architecture strictly following Technical Specification §3:
  `UI` -> `Application Services` -> `Chat API` -> `Data Provider` -> `Supabase PostgreSQL / Realtime / Storage` (with seamless upgrade path to Matrix API / Synapse).
- **Branding Engine**: Dynamic CSS Variables `:root` injection without full application rebuild.
- **Telegram Integration**: Dual mode architecture (Bot API + User Bridge Mautrix model).

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
| Telegram Service | `services/telegram-service.ts` | Telegram Bot & User Bridge integration | Data Provider | Telegram UI |
| File Service | `services/file-service.ts` | File validation (max 50MB) and upload/download | Data Provider | Chat UI |
| Auth Context | `lib/auth/auth-context.tsx` | Authentication, RBAC checks & session state | User Service | Next Pages |
| Theme Provider | `components/ui/theme-provider.tsx` | Dynamic CSS variable `:root` injector | Branding Service | Root Layout |

## Decisions Log
| # | Date | Decision | Context | Alternatives rejected | Reversal cost |
|---|------|----------|---------|-----------------------|---------------|
| 1 | 2026-08-10 | Data Provider Abstraction | Tech Spec §3 requires UI decoupling from Supabase for future Matrix migration | Direct Supabase client calls inside React components | Medium |
| 2 | 2026-08-10 | Dynamic Branding via CSS Root Variables | Tech Spec §20-21 requires branding updates without code rebuild | Rebuilding static bundles per client | Low |
| 3 | 2026-08-10 | In-Memory & LocalStorage Fallback Provider | Ensures instant standalone demo execution without mandatory external Supabase project keys | Hard dependency on live cloud credentials | Low |
| 4 | 2026-08-10 | Git Ignore Policy | Standardize ignored technical files (node_modules, .next, .superpowers, logs, env) | Committing build artifacts and secret keys | Low |
| 5 | 2026-08-11 | Real Supabase Provider Selected at Runtime via `resolveProviderMode()` | Tech Spec §3 requires a production-grade backend (real Postgres Auth/RLS/Realtime) while keeping the zero-config mock demo path working out of the box | Always requiring live Supabase credentials; a build-time flag instead of a runtime env check | Medium |

## Task Log
| # | Task | Mode | Status | Files | Goals satisfied (G1–G4) | Notes |
|---|------|------|--------|-------|--------------------------|-------|
| 1 | Project setup & Data Provider architecture | Feature | Completed | `types/index.ts`, `lib/provider/*`, `services/*` | G1, G2, G3, G4 | Core architecture established |
| 2 | Supabase Database Schema & Seed | Feature | Completed | `supabase/migrations/001_initial_schema.sql`, `supabase/seed.sql` | G2, G3, G4 | Production PostgreSQL schema |
| 3 | Auth & Dynamic Branding Engine | Feature | Completed | `lib/auth/*`, `services/branding-service.ts`, `components/ui/theme-provider.tsx` | G1, G2, G3 | Live CSS root variable updates |
| 4 | Chat UI & Realtime Messaging | Feature | Completed | `components/chat/*`, `components/sidebar/*` | G1, G2, G3 | DM, Groups, Channels, Reactions, Unread |
| 5 | Admin Panel & Audit Logs | Feature | Completed | `app/admin/*`, `components/admin/*` | G1, G2, G3, G4 | User management, RBAC, Branding editor |
| 6 | Telegram Integration UI | Feature | Completed | `components/telegram/*`, `services/telegram-service.ts` | G1, G2, G4 | Bot & User Bridge interface |
| 7 | Production Git Configuration | Refactor | Completed | `.gitignore` | G3, G4 | Exclusion of technical & temporary files |
| 8 | Backend Foundation — real Supabase provider (Auth, Postgres, Realtime) | Feature | Completed | `lib/provider/{index,supabase-client,supabase-provider}.ts`, `lib/auth/{index,auth-provider,mock-auth-provider,supabase-auth-provider}.ts`, `supabase/migrations/002_auth_and_rls.sql`, `app/api/audit-ip/route.ts`, `scripts/seed-supabase.ts`, `docs/SUPABASE_SETUP.md` | G1, G2, G3, G4 | `resolveProviderMode()` picks `mock` (zero-config, unchanged demo behavior) or `supabase` (real password auth, RLS-backed Postgres, Realtime broadcast) from `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`; `getDataProvider()`/`getAuthProvider()` factories wired into all 5 services + auth context; `SupabaseDataProvider` fully implements `IDataProvider` (35 members); RLS migration went through 2 fix rounds (privilege escalation, missing INSERT policy, member-bootstrap deadlock, audit-log RPC forgery — all closed). Mock provider files untouched (`mock-provider.ts`, `mock-auth-provider.ts` byte-identical since initial commit), so the zero-config demo path is unaffected. Task 16 full verification pass: 30/30 tests, clean build (17 routes incl. new `/api/audit-ip`), mock-mode regression checked via code-path inspection + dev-server route checks (no browser available); real-Supabase manual pass (Step 3) not run — no project credentials in this session. |

## Known Issues & Technical Debt
| Issue | Severity | Location | Impact on G1 / G3 / G4 | Owner | Plan |
|-------|----------|----------|------------------------|-------|------|
| External Mautrix Docker bridge deployment required for live Telegram sync | Low | `services/telegram-service.ts` | G1 (MVP 2 feature) | DevOps | Connect HTTPS bridge endpoint in production |
| Admin → Audit table reads `globalDataProvider` directly (no `AuditService`), bypassing the `getDataProvider()` factory | Medium | `components/admin/audit-table.tsx` | G3 — silently serves stale mock audit data forever in Supabase mode even though `SupabaseDataProvider.getAuditLogs()` is fully implemented | Backend | Add an `AuditService` wrapping `getDataProvider().getAuditLogs()` and rewire the table to it |
| Admin → Users "create user" throws in Supabase mode (profile-only insert isn't valid once real Supabase Auth owns signup) | Low | `components/admin/users-table.tsx`, `lib/provider/supabase-provider.ts` | G1/G3 — admin-invite flow for new users isn't implemented against real Supabase yet; caught and surfaced via `alert()` rather than silently failing | Backend | Implement an admin invite/signup flow against Supabase Auth (e.g. `supabase.auth.admin.inviteUserByEmail` via a server route) |
| Real Supabase mode (Auth, RLS, Realtime, seed script) has not been exercised end-to-end against a live project in this repo's automated sessions | Medium | `lib/provider/supabase-provider.ts`, `lib/auth/supabase-auth-provider.ts`, `supabase/migrations/002_auth_and_rls.sql` | G2/G3 — correctness relies on unit/mocked tests + code review only, not a live Postgres/Realtime run | DevOps/QA | Run `docs/SUPABASE_SETUP.md`'s setup + `npm run seed:supabase` against a real project and complete Task 16 Step 3's manual pass (password rejection, persistence-after-refresh, cross-window Realtime, branding broadcast) |
| `npm run lint` (`next lint`) has no ESLint config in the repo (none since the initial commit) and prompts interactively for setup, which hangs/no-ops in a non-interactive shell | Low | repo root (no `.eslintrc*` / `eslint.config.*`) | G4 — no automated lint signal in CI/local non-interactive runs; pre-existing, not introduced by this plan | DevOps | Run `next lint` once interactively (or commit a generated `eslint.config.mjs`) to pin a config |

## Build & Test Commands
- `npm run dev`: Launch local Next.js development server
- `npm run build`: Production build compilation (Verified 2026-08-11: Next.js 14.2.35, all routes compiled clean incl. the `/api/audit-ip` route added in the Backend Foundation plan)
- `npm run test`: Vitest suite (Verified 2026-08-11: 30/30 tests passing across 6 test files)
- `npm run lint`: not currently runnable non-interactively — see Known Issues (no ESLint config in repo)
- `npm run seed:supabase`: seeds a real Supabase project per `docs/SUPABASE_SETUP.md` (requires `.env.local` with project credentials, not available in automated sessions)
