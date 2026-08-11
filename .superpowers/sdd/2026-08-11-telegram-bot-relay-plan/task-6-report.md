# Task 6 Report: Telegram Documentation, Integration Review, and Security Audit

## Status

Completed the Task 6 documentation and audit scope without changing unrelated UI
styling or adding secrets.

## Files Changed

- `.env.local.example`
- `docs/SUPABASE_SETUP.md`
- `docs/TELEGRAM_SETUP.md`
- `PROJECT.md`
- `lib/telegram/config.ts`
- `lib/telegram/config.test.ts`

## Audit Checklist

- Service-role and Bot API imports: server-only imports are confined to API routes and `lib/telegram`; client provider modules use the authenticated account route or RLS-backed Supabase client.
- Public secret names: no Telegram or service-role secret uses a `NEXT_PUBLIC_` prefix, and no secret value was added.
- Logging and sensitive values: no raw token, bot token, service key, full message, or Telegram ID is logged; webhook and worker errors remain generic and the confirmation warning is non-sensitive.
- RPC safety: migration `003_telegram_bot_relay.sql` uses `SECURITY DEFINER SET search_path = public, pg_temp`, service-role checks, and explicit revoke/grant boundaries.
- Webhook and worker exposure: non-POST methods return `405`; webhook and worker secrets use constant-time comparison; malformed input and configuration failures return safe bodies.
- Link, inbound, and outbox atomicity: link claims and inbound dedupe use RPC transactions and uniqueness/locks; outbox idempotency uses a unique key and `FOR UPDATE SKIP LOCKED` leases.
- Worker duplicate-send semantics: retries are bounded; permanent 4xx errors stop; completion uncertainty is reported as ambiguous without scheduling a potentially duplicate failure transition.
- Mock ownership: mock link tokens, identity state, settings, and auth restoration remain current-user scoped; existing provider tests passed.
- Stale product claims: user-facing project/setup documentation now describes Bot API relay only and explicitly says phone login, Mautrix, MTProto, personal inboxes, groups, and media relay are unsupported. Remaining historical mentions are limited to design/plan documents describing out-of-scope behavior.
- Configuration validation finding fixed: `TELEGRAM_BOT_USERNAME` is normalized and path-safe; `TELEGRAM_WEBHOOK_URL` must be HTTPS and cannot contain URL credentials or a fragment. Focused tests cover both cases.

## Manual Checks Not Run

Live Supabase and Telegram checks were not run because this session had no
dedicated credentials. The destructive integration suite remains guarded by the
exact `SUPABASE_TEST_ALLOW_DESTRUCTIVE=I_UNDERSTAND_THIS_IS_A_DEDICATED_TEST_PROJECT`
confirmation and a separate test URL.

## Verification

- `npx vitest run lib/telegram/config.test.ts`: 11 passed.
- `npm run test`: 15 test files passed, 1 skipped; 141 tests passed, 5 skipped.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; 17 routes compiled.
- `git diff --check`: passed.

## Final Fix Wave Report

### Findings Closed

- Outbound completion now stores `telegram_relay_log` direction `outbound` in
  the same RPC transaction that marks the outbox row `sent`. The outbox captures
  both Telegram IDs and a stable Centras message/conversation correlation.
- Inbound webhook updates pass Telegram's reply-to message ID. The ingest RPC
  routes only to a matching outbound log or one unambiguous outbound
  conversation correlation, verifies direct membership, and rejects unknown or
  ambiguous messages without selecting an arbitrary coworker.
- Identity disconnect and notification disable changes cancel pending and leased
  rows. Lease selection and the worker's immediate pre-send check revalidate the
  active identity, recipient status, and setting without affecting normal chat
  message persistence.
- Expired rows at maximum attempts are marked terminal `failed` with a safe
  error code, including rows left leased by ambiguous accepted-send completion.
- Retry-After values are validated and capped by bounded retry configuration
  before retry timestamps are scheduled.
- Setup, design, and implementation-plan docs now describe at-least-once
  delivery and possible duplicates under accepted-send/database uncertainty,
  rather than exactly-once delivery.

### Regression Coverage

- Added focused tests for outbound correlation/log SQL contracts, reply-to
  parsing, wrong-chat prevention, disconnect/settings cancellation, pre-send
  eligibility, stale max-attempt cleanup, Retry-After validation/capping, and
  ambiguous completion behavior.
- Extended the guarded Supabase integration suite for transactional outbound
  logs, uncorrelated inbound rejection, pending/leased cancellation, and stale
  max-attempt terminalization.

### Verification

Final verification completed:

- Focused relay suite: 7 files passed, 107 tests passed, 9 skipped.
- Full `npm run test`: 15 files passed, 1 skipped; 150 tests passed, 9 skipped.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; all 17 routes compiled.
- `git diff --check`: passed.

Live Supabase and Telegram protocol checks remain manual and require a
dedicated test project and real Bot API credentials.

## Final Review Follow-up

### Findings Closed

- Pre-send eligibility now requires `leased_until > NOW()` in addition to the
  leased status and matching lease token, preventing a paused worker from
  sending after another worker reclaims the row.
- The SECURITY DEFINER trigger functions
  `enqueue_telegram_notification()`,
  `cancel_telegram_outbox_on_identity_change()`, and
  `cancel_telegram_outbox_on_settings_change()` explicitly revoke execution
  from `PUBLIC`, `anon`, and `authenticated`; trigger execution remains intact
  and no direct service-role grant was added for trigger-only functions.

### Regression Coverage

- Added a migration contract test for an expired lease retaining its old token.
- Added a guarded Supabase integration assertion that the pre-send RPC rejects
  that expired lease before reclamation.
- Added migration privilege-contract assertions for all three trigger
  functions.

### Verification

- Focused worker/migration plus guarded integration tests: 1 file passed, 1
  skipped; 24 tests passed, 9 skipped.
- Full `npm run test`: 15 files passed, 1 skipped; 151 tests passed, 9 skipped.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; all 17 routes compiled.
- `git diff --check`: passed.

The live Supabase regression assertion was skipped because this session has no
dedicated test-project credentials.
