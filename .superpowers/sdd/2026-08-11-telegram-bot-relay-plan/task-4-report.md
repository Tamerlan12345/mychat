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

- Pending final focused commit.

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
