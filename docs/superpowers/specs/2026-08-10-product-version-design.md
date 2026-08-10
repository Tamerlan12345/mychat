# Centras Chat — Product Version Design

Date: 2026-08-10
Status: Approved for planning

## 1. Goal

Take Centras Chat from a mock-data demo to a real, deployable product:

- Replace the in-memory mock backend with a real Supabase backend (auth, DB, storage, realtime), while preserving zero-config demo mode for local development.
- Add real audio/video calling and real file transfer.
- Add a real Telegram integration (bot-based account connect + presence-aware message relay).
- Overhaul the visual design so the app reads as a polished, professional product instead of a scaffold.
- Remove every remaining functional stub (fake login, fake settings save, fake audit IP, fake file upload).

Non-goals (explicitly out of scope for this pass): Telegram MTProto/user-session bridge (reading an employee's existing personal chats), group audio/video calls, Kanban/task management, literal "calls" through Telegram.

## 2. Architecture Overview

The app already has the right shape for this: a `IDataProvider` interface (`lib/provider/data-provider.ts`) sits between services and storage, with a single `MockDataProvider` implementation today. We keep that contract and add a second implementation.

```
UI (app/, components/)
  -> Services (services/*.ts)
    -> IDataProvider (lib/provider/data-provider.ts)
       -> MockDataProvider   (in-memory, always available, used when no Supabase env vars)
       -> SupabaseDataProvider (real Postgres/Auth/Storage/Realtime, used when configured)
```

A small provider factory (`lib/provider/index.ts`) picks the implementation at startup based on the presence of `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nothing above the provider layer needs to know which one is active — this is why the existing abstraction (Decision #1 in PROJECT.md) matters and why we're not touching it.

**Why this approach over alternatives:** we considered routing all Supabase access through Next.js API routes (hides the anon key, centralizes logic) versus calling `supabase-js` directly from the client (simpler, matches current architecture, relies on Postgres RLS for security — the standard Supabase pattern). We're going with direct client calls + RLS, because introducing a full API layer duplicates work RLS already does safely, and this app has no need to hide the anon key (it's meant to be public; security is enforced by RLS policies, same as any Supabase app). The one exception is real client-IP capture for audit logs, which is only available server-side — that gets one thin API route (`app/api/audit-ip/route.ts`).

## 3. Supabase Backend

### 3.1 Schema changes (new migration `002_auth_and_product.sql`)

- Link `profiles.id` to `auth.users.id` (foreign key + trigger `handle_new_user()` that inserts a `profiles` row on signup, so app users are always backed by real Supabase Auth accounts).
- RLS policies:
  - `profiles`: readable by any authenticated user (company directory); writable only by the row owner or ADMIN/SUPER_ADMIN.
  - `conversations` / `messages` / `message_reactions` / `attachments`: readable/writable only by conversation members (via `conversation_members` join), matching the app's existing access model.
  - `departments`, `branding_config`, `audit_logs`: admin-only writes, authenticated-read.
  - `telegram_accounts`, `telegram_link_tokens`: row owner only.
- New tables:
  - `telegram_link_tokens (token, user_id, expires_at, used)` — one-time deep-link tokens for the bot connect flow.
  - `telegram_relay_log (id, message_id, telegram_user_id, telegram_message_id, direction, created_at)` — maps a relayed Telegram message to the real row it created/came from in `messages`, so each relay is idempotent (no duplicate insert on webhook retry) and auditable. The relayed content itself lives in the normal `messages` table (not duplicated) — this table only stores the mapping.
- `user_settings.theme` becomes load-bearing (currently defined but unused — the light/dark toggle in §6 reads/writes it for real).

### 3.2 Auth

Replace the current "any email, no password check" login with real Supabase Auth (`supabase.auth.signInWithPassword`). Login page keeps its current layout; the password field becomes real. Admin-seeded demo accounts get created via the setup script (`scripts/seed-supabase.ts`) using `supabase.auth.admin.createUser`, so the "quick login" buttons on the login page keep working out of the box in a fresh project.

### 3.3 Realtime

Replace the mock's in-memory pub/sub (`messageSubscribers` Map, only works within one browser tab) with Supabase Realtime `postgres_changes` subscriptions on `messages`, scoped per conversation. Branding live-updates use a Realtime broadcast channel (already logically a broadcast, not DB-backed).

### 3.4 Setup path

I can't provision a Supabase project myself. Deliverables to make this self-serve:

- `.env.local.example` listing every required variable.
- `docs/SUPABASE_SETUP.md`: create free project → run `002_auth_and_product.sql` in the SQL editor → enable email auth → create the `attachments` storage bucket → set env vars → run seed script.
- The app runs with zero setup against the mock provider the moment env vars are absent, so this is additive, not a breaking requirement.

## 4. File Upload/Download

`FileService.uploadFile` currently returns `URL.createObjectURL(file)` — a browser-local blob URL that dies on refresh and was never actually stored anywhere. Real implementation:

- Supabase Storage bucket `attachments`, private.
- Upload path: `conversations/{conversation_id}/{uuid}-{filename}`.
- RLS/storage policy: readable only by members of that conversation (checked via the `conversation_members` table).
- Download: generate a signed URL (short-lived) on demand rather than making the bucket public.
- Existing validation (50MB limit, extension allow-list in `file-service.ts`) is kept as-is — it's already correct, just wasn't wired to real storage.
- Mock provider keeps the current `createObjectURL` behavior so local dev without Supabase still works.

## 5. Audio/Video Calls

New feature, 1:1 only (matches `DIRECT` conversations).

- `services/call-service.ts` + `useCall` hook wrapping `RTCPeerConnection`.
- Signaling via a Supabase Realtime broadcast channel per conversation (`call:{conversation_id}`): caller sends an `offer` event, callee responds with `answer`, both exchange `ice-candidate` events. No separate signaling server.
- STUN only (`stun:stun.l.google.com:19302`), no TURN. This is a known, documented limitation: calls between two networks that both do strict/symmetric NAT (common on some corporate firewalls) may fail to connect peer-to-peer. Flagged in `docs/SUPABASE_SETUP.md`, not silently swallowed.
- UI: call buttons (audio/video) in the chat header for DIRECT conversations, incoming-call toast with accept/decline, in-call overlay (mute, camera toggle, hang up), avatar placeholder when video is off.
- Call start/end events get written to `audit_logs` (reuses the existing table — no new logging system needed).

## 6. Telegram Integration (real, bot-based)

Replaces the fully-fake `TelegramService`/mock data with a real, ToS-safe integration:

**Connect flow**: user clicks "Connect Telegram" in Settings → app generates a one-time token (`telegram_link_tokens`) → opens `https://t.me/<YourBot>?start=<token>` → user presses Start in Telegram → bot webhook receives `/start <token>`, verifies it, and writes a real `telegram_accounts` row linking their Telegram user ID to their Centras Chat account.

**Message relay**:
- *Outbound (offline fallback)*: when a DIRECT message is sent to a user who is `OFFLINE`/`AWAY` and has Telegram connected + `user_settings.telegram_enabled`, the bot DMs them on Telegram with sender + content, tagged with a conversation reference. The mapping (`messages.id` → Telegram chat/message ID) is recorded in `telegram_relay_log`.
- *Inbound*: replies sent to the bot on Telegram arrive via webhook. The webhook looks up the sender's linked account, resolves their most recent relayed conversation (or last active DIRECT conversation if none), inserts a real row into `messages` for that conversation, and records the mapping in `telegram_relay_log`. The new message then shows up in the normal chat UI in real time via the existing Realtime subscription — there is no separate "Telegram inbox" data path anymore.
- Explicitly NOT included: reading the employee's other/existing Telegram chats, group call routing through Telegram, anything requiring an MTProto user session.

**Infra**: webhook is a standard Next.js API route (`app/api/telegram/webhook/route.ts`) — no extra process to host, unlike the MTProto path we ruled out. Requires one bot token from `@BotFather`, documented in `docs/SUPABASE_SETUP.md`.

**UI**: `components/telegram/telegram-view.tsx` and `app/telegram/page.tsx` get simplified from "fake inbox mirroring random chats" to what's real: connection status, connect/disconnect, relay activity log, and the `telegram_enabled` toggle (already a field in `user_settings`, currently unused — becomes load-bearing).

## 7. Visual Design System

Diagnosis: the current UI isn't broken, but it's visually flat — ad-hoc text sizes (`text-[10px]`, `text-[11px]` scattered inline), inconsistent shadow/border usage, three shades of slate doing all the work, no loading/empty states beyond bare text, and a `theme: 'dark'|'light'|'system'` setting that's defined in the types but never implemented.

Changes (all within `tailwind.config.js` + `app/globals.css`, additive to the existing branding CSS-variable engine so white-labeling still works):

- **Design tokens**: formal type scale (replacing inline arbitrary sizes), spacing scale, a layered surface system (`surface-0/1/2/3` instead of hardcoded `slate-950/900/800`), semantic text tokens (`text-primary/secondary/tertiary`), a shadow/elevation scale, consistent border-radius scale.
- **Light + dark theme**: implemented for real via CSS variable swap (same mechanism the branding engine already uses), driven by `user_settings.theme`, wired into the Settings page toggle. `system` respects `prefers-color-scheme`.
- **Empty/loading states**: skeleton loaders for conversation list and message list while data is fetching, instead of a blank flash.
- **Login page**: refined hero treatment (subtle mesh gradient, tightened spacing), real password field now that auth is real.
- **Admin tables** (`users-table`, `audit-table`): sticky header, hover states, proper empty state.
- **Settings page**: real persistence (writes to `user_settings` via the provider) replacing the current fake `setTimeout` "Сохранено" toast.
- We are **not** switching to a light-marketing-site look — nsoft-s.com is a marketing page for a different product, not a UI to clone. What we're taking from it is the underlying principle (clear hierarchy, generous spacing, restrained accent color, information clarity) applied to our existing dark corporate-messenger aesthetic, which is the right convention for this category of product (Slack/Discord/Telegram all default dark).

## 8. Error Handling

- Provider factory throws a clear startup error (visible in console) if only one of the two Supabase env vars is set (misconfiguration) rather than silently falling back to mock.
- WebRTC connection failures show a specific "couldn't establish connection" state in the call UI rather than hanging silently.
- Telegram webhook verifies a shared secret (Telegram's `X-Telegram-Bot-Api-Secret-Token` header) to reject spoofed requests.
- File upload surfaces real Supabase Storage errors (quota, network) through the existing `errorMsg` UI in `message-input.tsx`, not just client-side validation errors.

## 9. Testing Plan ("run it through completely")

- `npm run build` and `npm run lint` must pass clean.
- Full manual click-through against the mock provider (fully testable by me, no external dependency): login, chat send/edit/delete/react/reply, file attach (mock path), admin CRUD (users/departments/branding live-preview/audit), settings save, theme toggle.
- Supabase-backed path: verified by code review + a live pass if you provide a Supabase project's URL/anon key during implementation (or you run the documented setup and test it yourself). This will be called out explicitly in the final report — not silently assumed to work.
- Calls and Telegram relay: verified with two browser sessions / two Telegram-connected test accounts where credentials allow; otherwise verified by code review and manual protocol inspection (signaling messages, webhook payloads).

## 10. New Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-side only, for seed script + webhook DB writes
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```
