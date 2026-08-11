# Task 4 Report

## Status

Complete. Task 4 adds an atomic database-side outbox enqueue trigger, a server-only worker, a secret-protected worker route, and focused tests. No Telegram UI, ChatService Telegram call, media relay, Redis, or second queue was added.

## Files

- `supabase/migrations/003_telegram_bot_relay.sql`
- `lib/telegram/outbox-worker.ts`
- `lib/telegram/outbox-worker.test.ts`
- `app/api/telegram/worker/route.ts`
- `app/api/telegram/worker/route.test.ts`

## Commits

- `c428250 feat: add Telegram outbox worker`

## Tests

- `npx vitest run lib/telegram/outbox-worker.test.ts` passed: 13 tests.
- `npx vitest run app/api/telegram/worker/route.test.ts` passed: 10 tests.
- `npm run test` passed: 15 files, 129 tests.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `git diff --check` passed with only existing line-ending warnings.

## Self-Review

- Message persistence never calls Telegram; the `AFTER INSERT` `SECURITY DEFINER` trigger enqueues only direct recipients who are `OFFLINE` or `AWAY`, have an active identity, and have Telegram notifications enabled.
- Outbox idempotency uses message and recipient IDs, and the database lease RPC retains `FOR UPDATE SKIP LOCKED`, max-attempt, and expired-lease guards.
- The worker uses the lease token for completion/failure, retries network/429/5xx-class failures with bounded jittered backoff, honors `retry_after`, and permanently fails 4xx errors.
- Worker route configuration and secret failures return safe statuses; server-only modules never expose bot or service credentials to browser code.
- Sensitive exception text is normalized to safe error codes and is not logged or returned.

## Concerns

- The migration must be applied to the Supabase database before production messages can enqueue; an in-flight Telegram request that outlives its lease can still be reclaimed and retried by design.

## Review Fix Report

### Status

Task 4 review findings are addressed in the scoped fix commit `0e21576`. No
Telegram UI, Redis, browser-side Bot API access, or service-role exposure was
added.

### Fixes

- `completeOutbox` and `failOutbox` transition results are now checked. A
  false result or transition exception is reported as `ambiguous` and is not
  counted as sent, retried, or failed.
- After Telegram accepts a message, an ambiguous completion never calls
  `failOutbox`; this prevents the worker from scheduling an immediate resend
  when durable completion is unknown.
- Bot API requests now use `AbortController` with a bounded timeout. The
  worker passes a timeout below the bounded lease duration, including a
  safety margin, and timeout errors remain safe retryable error codes.
- The Bot API timeout test verifies abort propagation and the safe `TIMEOUT`
  error without exposing credentials or message data.
- `supabase/telegram-outbox.integration.test.ts` is optional and runs only
  when separate test credentials, a non-empty
  `SUPABASE_TEST_PROJECT_MARKER`, and the exact
  `SUPABASE_TEST_ALLOW_DESTRUCTIVE=I_UNDERSTAND_THIS_IS_A_DEDICATED_TEST_PROJECT`
  confirmation are present. It also rejects a test URL equal to
  `NEXT_PUBLIC_SUPABASE_URL`; otherwise it emits a clear skip message before
  any service-role mutation or deletion. The tests cover direct eligibility,
  `OFFLINE`/`AWAY` behavior,
  connected/settings-disabled exclusion, trigger-backed atomic enqueue,
  idempotency, authenticated RLS reads, denied outbox/RPC access, stale lease
  reclaim/token protection, and concurrent lease exclusion.
- Worker secrets are trimmed, restricted to URL-safe characters, and require
  at least 32 characters. The minimum is documented in both the environment
  example and the Telegram design specification.
- A leased row without a lease token is never sent or silently marked failed;
  it is surfaced through the safe `corrupt` worker count and the route returns
  that count without row data. This keeps the malformed row visible for
  operator remediation instead of hiding a permanently leased condition.

### Files

- `lib/telegram/outbox-worker.ts`
- `lib/telegram/outbox-worker.test.ts`
- `lib/telegram/bot-api.ts`
- `lib/telegram/bot-api.test.ts`
- `lib/telegram/config.ts`
- `lib/telegram/config.test.ts`
- `app/api/telegram/worker/route.test.ts`
- `supabase/telegram-outbox.integration.test.ts`
- `.env.local.example`
- `docs/superpowers/specs/2026-08-11-telegram-bot-relay-design.md`

### Verification

- `npx vitest run lib/telegram/outbox-worker.test.ts app/api/telegram/worker/route.test.ts lib/telegram/bot-api.test.ts lib/telegram/config.test.ts`: passed, 55 tests.
- `npx vitest run supabase/telegram-outbox.integration.test.ts`: skipped, 5 tests, because the dedicated-project safety marker and confirmation were absent; no service-role operation ran.
- `npm run test`: passed, 15 files, 136 tests; 1 optional file and 5 tests skipped.
- `npx tsc --noEmit`: passed after the completed build generated `.next/types`.
- `npm run build`: passed.
- `git diff --check`: passed with only existing CRLF conversion warnings.

### Self-Review And Concerns

- The database remains the source of truth for lease ownership and transition
  results; the worker does not infer success from a completed Bot API call.
- An accepted Telegram send followed by an unavailable completion result is
  intentionally ambiguous. The row may be reclaimed after lease expiry, so a
  later duplicate remains possible without a provider-side reconciliation key.
- The optional integration suite requires a migrated dedicated Supabase
  project and real test credentials; it was not executed against a live
  project in this environment. The destructive test guard also requires the
  explicit project marker and confirmation documented above.
