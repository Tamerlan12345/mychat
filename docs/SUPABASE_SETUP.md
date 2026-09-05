# Real Supabase Backend Setup

By default Centras Chat runs against a built-in mock backend — no setup needed.
Follow this guide to switch it to a real, persistent Supabase backend.

## 1. Create a project

Go to https://supabase.com/dashboard → New project. Free tier is enough to start.
Note the project's **URL**, **anon public key**, and **service_role key** (Project Settings → API).

## 2. Run the migrations

Project → SQL Editor → New query. Paste and run, in this exact order:

1. The full contents of `supabase/migrations/001_initial_schema.sql`
2. The full contents of `supabase/migrations/002_auth_and_rls.sql`
3. The full contents of `supabase/migrations/003_telegram_bot_relay.sql`

Apply `003_telegram_bot_relay.sql` only after `001` and `002`. It creates the
Bot API link, identity, relay-log, and notification-outbox tables plus the
service-role-only RPCs used by the webhook and worker. Do not rewrite the
already-applied migrations in a production project.

Migration 002 also adds the `messages` table to the `supabase_realtime` publication
(`ALTER PUBLICATION supabase_realtime ADD TABLE messages;`) — this is required for
live message delivery (`subscribeToMessages`) to work at all; a fresh Supabase project's
publication starts empty. No separate manual dashboard step is needed for standard
projects, but if your project's owner role ever lacks privileges to alter the
publication, do it manually instead: Database → Replication → toggle on the `messages`
table for the `supabase_realtime` publication.

### Migration 004 — conversation list RPC

Apply `supabase/migrations/004_conversations_overview.sql` as well: it adds the `conversations_overview()` function (one round trip for the sidebar) and an index on `messages (conversation_id, created_at)`. The client detects a missing function and falls back to per-conversation queries, so the app keeps working before the migration is applied — just slower.

## 3. Enable email auth

Authentication → Providers → Email → make sure it's enabled (it is by default).
Authentication → Settings → turn **off** "Confirm email" for local testing, so seeded/demo accounts can sign in immediately without clicking an email link. Turn it back on before real production use.

## 4. Set your environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=<your project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
SUPABASE_SERVICE_ROLE_KEY=<your service_role key>

# Required for Telegram Bot API relay; see docs/TELEGRAM_SETUP.md.
TELEGRAM_BOT_TOKEN=<BotFather token>
TELEGRAM_BOT_USERNAME=<bot username>
TELEGRAM_WEBHOOK_SECRET=<Telegram webhook secret>
TELEGRAM_WEBHOOK_URL=https://<your-host>/api/telegram/webhook
TELEGRAM_WORKER_SECRET=<dedicated URL-safe secret, at least 32 characters>
```

Keep `SUPABASE_SERVICE_ROLE_KEY` and all `TELEGRAM_*` values server-side. None
of them may use a `NEXT_PUBLIC_` prefix or be committed to tracked files. The
webhook URL must be HTTPS. The worker secret is sent only in the
`X-Worker-Secret` header by a trusted scheduler.

Restart `npm run dev` after editing this file — Next.js only reads it on startup.

## 5. Seed demo data

```bash
npm run seed:supabase
```

Creates the same four demo accounts the mock provider ships with (`admin@demo.local`, `employee1@demo.local`, `employee2@demo.local`, `employee3@demo.local`, all with password `password123`), plus departments and branding defaults.

## 6. Verify

`npm run dev`, log in as `admin@demo.local` / `password123`. You should see the seeded departments in Admin → Users, and messages you send should still be there after a full page refresh (proof it's really persisted, not the in-memory mock).

## 7. Telegram relay setup

Complete BotFather setup, webhook registration, worker scheduling, safe
troubleshooting, token rotation, and manual relay checks in
[`docs/TELEGRAM_SETUP.md`](TELEGRAM_SETUP.md). The Telegram setup guide also
documents the optional destructive integration-test environment and its exact
confirmation guard.

## Known limitations at this stage

- Admin "create user" in the UI is not yet wired to Supabase Auth invite flow (throws with a clear message) — creating additional real users currently requires the seed script or the Supabase dashboard directly. This is called out as a follow-up, not a hidden gap.
- File upload/download and audio/video calls are separate plans layered on top of this one.
- Telegram supports Bot API linking, direct-message notifications, and private-text inbound relay only. Phone login, Mautrix, MTProto, personal Telegram inboxes, group synchronization, and media relay are not supported.
- Live Supabase and Telegram verification is not claimed unless dedicated credentials are available; the automated test suite skips the destructive Supabase integration test otherwise.
- Admin audit log page (`/admin/audit`) still reads mock data instead of Supabase-backed audit logs — pending a follow-up `AuditService` integration.
