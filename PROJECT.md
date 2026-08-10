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

## Known Issues & Technical Debt
| Issue | Severity | Location | Impact on G1 / G3 / G4 | Owner | Plan |
|-------|----------|----------|------------------------|-------|------|
| External Mautrix Docker bridge deployment required for live Telegram sync | Low | `services/telegram-service.ts` | G1 (MVP 2 feature) | DevOps | Connect HTTPS bridge endpoint in production |

## Build & Test Commands
- `npm run dev`: Launch local Next.js development server
- `cmd /c "node node_modules\next\dist\bin\next build"`: Production build compilation (Verified: Next.js 14.2.35, 16/16 routes compiled)
