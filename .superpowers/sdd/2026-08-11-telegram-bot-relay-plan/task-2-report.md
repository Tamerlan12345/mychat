# Task 2 Report

## Status

Complete for Task 2 only.

## Changed Files

- `lib/telegram/bot-api.ts`
- `lib/telegram/bot-api.test.ts`
- `lib/telegram/repository.ts`
- `lib/telegram/repository.test.ts`
- `lib/telegram/server-client.ts`
- `.superpowers/sdd/2026-08-11-telegram-bot-relay-plan/task-2-report.md`

## Commits

- `d81136b` - `feat: add Telegram server API repository`

## Tests And Outputs

- `npx vitest run lib/telegram/bot-api.test.ts lib/telegram/repository.test.ts` - 2 files passed, 10 tests passed.
- `npx tsc --noEmit` - passed with no output.
- `git diff --check` - passed with no whitespace errors; it reported existing line-ending warnings for unrelated UI files.
- Additional verification: `npx vitest run` - 9 files passed, 50 tests passed.

The focused and full Vitest commands emit the existing Vite CommonJS/ESM configuration warning. It did not affect test results.

## Self-Review

- `server-client.ts`, `bot-api.ts`, and `repository.ts` fail closed when evaluated in a browser. No browser or component imports of the server modules were found.
- The Supabase service-role client is lazy, cached, sessionless, auto-refresh-disabled, and has no cookie adapter.
- Bot API requests use native `fetch`, the exact `sendMessage` endpoint, JSON fields, Telegram's bounded message length, and safe typed 429/5xx/4xx/network errors. `retry_after` is parsed for 429 responses.
- Bot tokens, service keys, Telegram IDs, and full message content are excluded from thrown error messages.
- Repository table/RPC names and migration parameter shapes are centralized. Link creation persists only the SHA-256 token hash, and Supabase failures map to safe internal codes without provider text.
- Identity reads, relay-log reads, and active-identity disconnect are server-side table operations. No webhook, provider, UI, or worker orchestration was added.
- Only Task 2 files were staged and committed; unrelated UI changes, the UI plan, and `tsconfig.tsbuildinfo` remain outside the commit.

## Concerns

- No local Supabase/PostgreSQL instance is configured, so RPC execution and service-role client behavior were verified with mocks and static contract review only.
- Real Telegram Bot API behavior still requires a configured token and manual integration verification in later tasks.

## Review Fix Report

### Status

Important findings and the requested concrete Minor test gaps are fixed for Task 2 only.

### Fixes

- Claim RPC rows are mapped from the migration's `identity_id` field to the `id` field exposed by the repository. Empty arrays and null results normalize to `null`; malformed non-empty rows become a safe database error.
- User-scoped link creation, identity reads, relay-log reads, and disconnect now require a branded `TelegramUserScope`. The server auth boundary creates it from the authenticated actor only, binds `ownerUserId` to `actorUserId`, and the repository rejects mismatched scopes before any service-role query. Claim, inbound, lease, completion, and failure operations remain separate trusted webhook/worker operations.
- Added the `server-only` dependency and imports to all Telegram server modules. Vitest mocks the marker package while runtime boundary tests cover the modules; `npm run build` passed with the real dependency.
- Added tests for actual claim RPC shape, empty claims, Retry-After header fallback, malformed success payloads, runtime input validation, cross-profile rejection, and server-only enforcement.

### Verification Commands And Outputs

- `npx vitest run lib/telegram/bot-api.test.ts lib/telegram/repository.test.ts` - 2 files passed, 24 tests passed.
- `npx vitest run lib/telegram/config.test.ts` - 1 file passed, 8 tests passed.
- `npx vitest run` - 9 files passed, 64 tests passed.
- `npx tsc --noEmit` - passed with no output.
- `npm run build` - passed; Next.js production build compiled, lint/type checks passed, and 17 static pages generated.
- `git diff --check` - passed with no whitespace errors; existing line-ending warnings remain for unrelated UI files and changed Telegram files.

The Vitest commands continue to emit the existing Vite CommonJS/ESM configuration warning; it did not affect results. `npm install server-only` also reported two pre-existing high-severity audit findings; no audit fix was applied.

### Fix Self-Review

- No client component imports the Telegram server modules. `server-only` provides the build-time boundary, and runtime guards remain defense in depth.
- No user-scoped repository operation accepts a raw profile ID. Scope validation checks the unforgeable brand and actor/owner equality before obtaining the service-role client.
- Trusted service operations are intentionally not scope-bound because their callers are the later secret-protected webhook and worker boundaries; they are not browser-callable.
- Unrelated UI changes, the UI plan, and `tsconfig.tsbuildinfo` were not staged.

### Remaining Concerns

- The authenticated actor scope factory is a server-boundary contract; later provider/auth code must call it only with the authenticated session subject, never request-supplied profile data.
- RPC execution still needs integration verification against a configured Supabase/PostgreSQL instance.

## Authentication Boundary Fix Report

### Status

The remaining reviewer finding is fixed for Task 2 only.

### Fixes

- Replaced the caller-supplied actor/profile scope factory with `createTelegramUserScope(accessToken)`.
- Scope creation now calls Supabase Auth `getUser(accessToken)` through a separate lazy anon-key Supabase client configured with `persistSession: false`, `autoRefreshToken: false`, and no cookies.
- The scope owner is derived only from the verified `data.user.id`; no owner or profile ID is accepted as authority.
- Missing tokens fail before Auth lookup. Invalid tokens and Auth responses without a user fail with a safe authentication error. Service-role RPC operations remain separate trusted webhook/worker APIs.
- Added repository tests for Auth success, missing/invalid token rejection, and cross-profile scope rejection, plus server-client coverage proving anon-key sessionless configuration.

### Verification Commands And Outputs

- `npx vitest run lib/telegram/repository.test.ts` - 1 file passed, 11 tests passed.
- `npx vitest run lib/telegram/server-client.test.ts` - 1 file passed, 1 test passed.
- `npx vitest run` - 10 files passed, 69 tests passed.
- `npx tsc --noEmit` - passed with no output.
- `npm run build` - passed; Next.js production build compiled, lint/type checks passed, and 17 static pages generated.
- `git diff --check` - passed with no whitespace errors; existing line-ending warnings remain for unrelated UI files and changed Telegram files.

The Vitest commands continue to emit the existing Vite CommonJS/ESM configuration warning. No Supabase instance is configured, so Auth and RPC behavior is verified with mocks plus static client configuration checks.

### Self-Review

- `createTelegramUserScope` has no owner/profile argument and cannot bind scope ownership without a verified Supabase Auth subject.
- Auth verification uses the public anon key client, while repository reads and mutations continue using the separate service-role client only after scope creation or trusted service entry points.
- `server-only` imports and runtime guards remain in place. No webhook, provider, worker, or UI code was changed.
- Unrelated UI changes, the UI plan, and `tsconfig.tsbuildinfo` were not staged.

### Concerns

- The later authenticated server boundary must pass the actual Supabase access token, not a user-supplied profile ID or substituted subject.
- Live Auth/RPC integration still requires a configured Supabase project.
