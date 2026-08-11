# Telegram Bot Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Telegram Bot API account linking, direct-message notifications, inbound relay, and retryable PostgreSQL outbox while keeping Supabase and email/password authentication.

**Architecture:** Keep browser Supabase access behind the existing provider abstraction and RLS. Add a server-only Telegram module using a service-role Supabase client, a protected webhook, a protected outbox worker, and PostgreSQL RPCs for atomic token claiming, inbound deduplication, and outbox leasing. Remove the old phone/Mautrix inbox behavior from the Telegram UI.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase PostgreSQL/Auth/RLS/Realtime, native `fetch` for Telegram Bot API, Vitest.

## Global Constraints

- Email/password remains the only application login method.
- Telegram is limited to Bot API invitations, identity linking, and notifications.
- MTProto, Mautrix, phone login, Telegram user sessions, group synchronization, and media relay are out of scope.
- The browser never receives `TELEGRAM_BOT_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY`.
- No Redis, BullMQ, or separate message broker.
- Do not rewrite applied migrations `001` or `002`; add `003_telegram_bot_relay.sql`.
- Preserve mock mode when Supabase variables are absent.

---

### Task 1: Types, Server Configuration, and Database Migration

**Files:**
- Create: `supabase/migrations/003_telegram_bot_relay.sql`
- Create: `lib/telegram/config.ts`
- Modify: `types/index.ts`
- Modify: `.env.local.example`
- Test: `lib/telegram/config.test.ts`

**Interfaces:**
- Produces `TelegramIdentity`, `TelegramLinkToken`, `TelegramRelayLog`, `TelegramNotificationOutbox`, and server config types used by later tasks.
- Produces tables and RPC names: `claim_telegram_link_token`, `ingest_telegram_inbound`, `lease_telegram_outbox`, `complete_telegram_outbox`, `fail_telegram_outbox`.

- [ ] **Step 1: Add failing config tests**

Test that missing server variables fail closed, valid variables parse, `TELEGRAM_WEBHOOK_SECRET` rejects characters outside Telegram's allowed set, and default retry values are bounded.

- [ ] **Step 2: Add migration schema and constraints**

Create `telegram_link_tokens`, `telegram_identities`, `telegram_relay_log`, and `telegram_notification_outbox`. Enable RLS, add owner read policies, unique identity/idempotency constraints, leases, retry fields, and security-definer RPCs. Service-role-only mutations must not be exposed to `anon` or `authenticated`.

- [ ] **Step 3: Implement server config validation**

Read `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, and `TELEGRAM_WORKER_SECRET` only in server modules. Use `crypto.randomBytes` for raw link tokens and SHA-256 for persisted hashes.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run lib/telegram/config.test.ts`
Expected: all config tests pass.

### Task 2: Server Telegram API and Repository

**Files:**
- Create: `lib/telegram/bot-api.ts`
- Create: `lib/telegram/repository.ts`
- Create: `lib/telegram/server-client.ts`
- Test: `lib/telegram/bot-api.test.ts`
- Test: `lib/telegram/repository.test.ts`

**Interfaces:**
- Consumes config and migration RPCs from Task 1.
- Produces `sendTelegramMessage`, `createTelegramLink`, `claimTelegramLink`, `ingestTelegramInbound`, `leaseOutbox`, `completeOutbox`, and `failOutbox` server-only functions.

- [ ] **Step 1: Test Telegram API behavior**

Mock `fetch` and verify `sendMessage` uses the bot token only in the server URL, sends JSON, throws typed errors for 429/5xx/4xx, parses `retry_after`, and never includes secrets in thrown messages.

- [ ] **Step 2: Implement server-only Supabase client**

Create a lazy `createClient` with service role, `persistSession: false`, `autoRefreshToken: false`, and no cookies. Keep it out of client-importable modules.

- [ ] **Step 3: Implement typed Bot API wrapper**

Use native `fetch` against `https://api.telegram.org/bot<TOKEN>/sendMessage`. Support `chat_id`, `text`, and optional `disable_web_page_preview`; bound preview text before sending.

- [ ] **Step 4: Implement repository RPC wrappers**

Keep SQL names and parameter shapes centralized. Convert Supabase errors to safe internal error codes. Never log raw token, Telegram ID, service key, or full message text.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run lib/telegram/bot-api.test.ts lib/telegram/repository.test.ts`
Expected: all focused tests pass.

### Task 3: Link Token and Webhook Flow

**Files:**
- Create: `app/api/telegram/webhook/route.ts`
- Create: `app/api/telegram/webhook/route.test.ts`
- Modify: `lib/provider/data-provider.ts`
- Modify: `lib/provider/mock-provider.ts`
- Modify: `lib/provider/supabase-provider.ts`
- Modify: `services/telegram-service.ts`

**Interfaces:**
- Produces client-safe `TelegramService.createLink`, `getAccount`, `disconnect`, and `getRelayLogs` methods.
- Webhook accepts Telegram `Update` payloads and returns `401`, `405`, `400`, `503`, or safe `200` responses according to the design.

- [ ] **Step 1: Add route tests before implementation**

Cover invalid method, missing/wrong secret, malformed JSON, `/start <token>`, expired token, duplicate update, unknown identity, unsupported group update, and inbound private text.

- [ ] **Step 2: Add provider contracts and mock behavior**

Replace phone/inbox-only Telegram methods with link-token/status/activity methods. Keep mock mode deterministic and simulate one-time token use without external Telegram calls.

- [ ] **Step 3: Implement authenticated link creation**

Create the raw token server-side, persist only its hash through the provider, and return a deep link built from `TELEGRAM_BOT_USERNAME`. Do not expose service configuration to components.

- [ ] **Step 4: Implement webhook validation and parsing**

Set Node runtime and force dynamic execution. Require POST, validate the secret header with constant-time comparison, parse only private `/start` and text/caption updates, and return safe statuses without leaking internals.

- [ ] **Step 5: Implement `/start` linking**

Call the atomic claim RPC, link the Telegram identity to the profile, and send a confirmation. If confirmation sending fails after commit, return `200` and record a safe warning rather than consuming the token twice.

- [ ] **Step 6: Run route tests**

Run: `npx vitest run app/api/telegram/webhook/route.test.ts`
Expected: all webhook tests pass.

### Task 4: Outbox Creation and Worker

**Files:**
- Create: `lib/telegram/outbox-worker.ts`
- Create: `app/api/telegram/worker/route.ts`
- Create: `lib/telegram/outbox-worker.test.ts`
- Modify: `services/chat-service.ts`
- Modify: `lib/provider/supabase-provider.ts`
- Modify: `lib/provider/mock-provider.ts`

**Interfaces:**
- Consumes repository lease/complete/fail operations and Bot API wrapper from Task 2.
- Produces notification enqueueing for eligible direct messages and a secret-protected worker trigger.

- [ ] **Step 1: Test retry policy**

Cover success, network error, 429 with `Retry-After`, 5xx exponential backoff, permanent 4xx failure, max attempts, lease expiry, and concurrent lease exclusion.

- [ ] **Step 2: Add eligibility check to message send path**

For a DIRECT recipient only, enqueue when recipient status is `OFFLINE` or `AWAY`, the linked identity is active, and `user_settings.telegram_enabled` is true. Do not block normal message persistence when Telegram is unavailable.

- [ ] **Step 3: Implement worker processing**

Lease rows, revalidate identity/status/settings immediately before calling `sendMessage`, mark success with Telegram message ID and an outbound relay log, or schedule bounded retry/failure. Use safe error codes and never log sensitive payloads. Delivery is at-least-once, not exactly-once, when Telegram accepts a send but completion persistence is uncertain.

- [ ] **Step 4: Add protected worker route**

Require `X-Worker-Secret` matching `TELEGRAM_WORKER_SECRET`, process a bounded batch, and return counts. Never allow browser invocation without the secret.

- [ ] **Step 5: Run outbox tests**

Run: `npx vitest run lib/telegram/outbox-worker.test.ts`
Expected: all retry and lease tests pass.

### Task 5: Inbound Relay and Telegram UI

**Files:**
- Modify: `components/telegram/telegram-view.tsx`
- Modify: `app/telegram/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `components/sidebar/sidebar.tsx`
- Modify: `services/telegram-service.ts`
- Test: `components/telegram/telegram-view.test.tsx` if the existing test setup supports component rendering

**Interfaces:**
- Consumes the client-safe TelegramService API from Task 3.
- Produces a clear connect/disconnect/status/activity UI and persists `telegram_enabled` through the existing provider path.

- [ ] **Step 1: Remove old phone/Mautrix inbox controls**

Delete phone input, fake chat list, fake message composer, and claims about personal Telegram session encryption. Keep the page focused on Bot API linking and relay status.

- [ ] **Step 2: Add link flow UI**

Provide a button that requests a deep link, shows it as a copyable/openable action, and displays connected Telegram username/status without exposing bot credentials.

- [ ] **Step 3: Add relay activity and disconnect**

Render safe activity rows from `getRelayLogs`, with loading/empty/error states. Disconnect only the current user's identity.

- [ ] **Step 4: Persist notification preference**

Wire the existing Telegram notification toggle to real user settings instead of local state or timeout simulation.

- [ ] **Step 5: Run existing UI/build checks**

Run: `npm run test; npm run build`
Expected: all tests pass and all routes compile.

### Task 6: Documentation, Integration Review, and Security Audit

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/SUPABASE_SETUP.md`
- Create: `docs/TELEGRAM_SETUP.md`
- Modify: `PROJECT.md`
- Test: full repository test suite

- [ ] **Step 1: Document setup**

Document BotFather creation, `003_telegram_bot_relay.sql`, HTTPS `setWebhook`, secret header, worker trigger, `getWebhookInfo`, token rotation, and the fact that phone/Mautrix is not supported.

- [ ] **Step 2: Review imports and secret boundaries**

Search for `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `bot-api`, and `repository` to ensure no client component or `NEXT_PUBLIC_` variable imports them.

- [ ] **Step 3: Run full verification**

Run: `npm run test; npm run build; git diff --check`
Expected: all tests pass, production build passes, and no whitespace errors are reported.

- [ ] **Step 4: Perform code review**

Review every changed file for RLS bypass scope, token hashing, constant-time secret comparison, update idempotency, error leakage, duplicate Telegram sends, and behavior when the bot is unavailable. Fix findings before completion.
