# Telegram Bot Relay Setup

Centras Chat uses the Telegram Bot API for one-time account linking, direct-message notifications, and private text relay. It does not log in to a personal Telegram account and does not read a user's existing Telegram inbox.

## Requirements

- A real Supabase project with migrations `001`, `002`, and `003` applied in that order.
- A public HTTPS deployment of the Next.js application for the webhook.
- A trusted scheduler that can call the worker endpoint.
- A dedicated BotFather bot token and a separate worker secret.

## Create The Bot

1. Open Telegram and start a chat with `@BotFather`.
2. Run `/newbot`, choose a display name, and choose a username accepted by BotFather. Bot usernames normally end in `bot`.
3. Store the token only in the deployment secret manager or an untracked local `.env.local` file. Never put it in this guide, source code, screenshots, issue reports, or logs.
4. Set `TELEGRAM_BOT_USERNAME` to the bot username. An optional leading `@` is accepted and normalized.

The required server variables are:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_URL=https://<your-host>/api/telegram/webhook
TELEGRAM_WORKER_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` is also required by the server-side repository.
The browser must receive only the existing `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; no Telegram secret or service-role key may use
the `NEXT_PUBLIC_` prefix.

## Apply Supabase SQL

In Supabase SQL Editor, run these files in this exact order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_auth_and_rls.sql`
3. `supabase/migrations/003_telegram_bot_relay.sql`

Migration `003` enables RLS for the relay tables, keeps browser roles from
mutating relay state, and installs the atomic link-claim, inbound-dedupe, and
outbox lease RPCs. Do not expose the service-role key to a client or grant the
relay RPCs to `anon` or `authenticated`.

## Register The Webhook

Use an HTTPS URL that reaches the deployed route. The secret is sent by
Telegram in `X-Telegram-Bot-Api-Secret-Token`; it is not the worker secret.
Run the command from a trusted shell with the values supplied by your secret
manager, not from a tracked file:

```bash
curl --fail --silent --show-error -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  --data "{\"url\":\"${TELEGRAM_WEBHOOK_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\"]}"
```

The application validates the configured webhook URL as HTTPS. Do not paste a
tokenized URL or secret into a shell history that is shared with other users.

## Run The Worker

The worker endpoint is `POST /api/telegram/worker`. A trusted scheduler must
send the dedicated secret in `X-Worker-Secret`:

```bash
curl --fail --silent --show-error -X POST "https://<your-host>/api/telegram/worker" \
  -H "X-Worker-Secret: ${TELEGRAM_WORKER_SECRET}"
```

Schedule it about once per minute, or more frequently if the deployment and
Telegram rate limits allow. Each invocation processes a bounded lease batch.
Do not invoke this endpoint from browser code. A network error, timeout, 429,
or 5xx response is retried with bounded backoff; permanent Telegram 4xx
responses fail the row. If Telegram accepted a message but completion cannot
be persisted, the worker reports an ambiguous result and does not immediately
schedule a duplicate send.

## Verify The Webhook

From a trusted shell, inspect only Telegram's safe status response:

```bash
curl --fail --silent --show-error "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Confirm that `url` is the expected HTTPS route, `has_custom_certificate` is
appropriate for the deployment, and `last_error_message` is empty or
understood. Do not publish the response if it includes deployment details.
Never include the bot token, webhook secret, worker secret, full message
content, or Telegram IDs in troubleshooting logs.

Safe troubleshooting order:

1. Check that the deployment is reachable over HTTPS and the route is live.
2. Re-run `getWebhookInfo` and inspect only the status fields.
3. Confirm the configured secret matches the deployment secret without printing either value.
4. Check application logs for safe status/error codes only.
5. If the webhook is wrong, call `setWebhook` again from a trusted shell.
6. Use `deleteWebhook` only when intentionally moving the bot to another deployment.

## Link And Unlink Accounts

An authenticated user requests a one-time deep link from the Telegram page.
The server stores only a SHA-256 hash of the random token. The link expires in
10 minutes and a successful `/start <token>` claim is atomic and single-use.
The webhook accepts only private chats and sends a short confirmation after the
database link is committed.

Disconnecting Telegram marks the current identity as `disconnected`; it stops
new eligible notification rows and prevents inbound relay from that identity.
Messages already accepted by Telegram or already leased by the worker may
complete under the normal outbox semantics. Generate a new link to reconnect.

## Rotate The Bot Token

1. In `@BotFather`, use `/revoke` for the old token and `/token` to issue a new one, or follow the current BotFather prompt for token rotation.
2. Replace `TELEGRAM_BOT_TOKEN` in the deployment secret manager. Do not commit it.
3. Restart or redeploy the server so the new value is loaded.
4. Call `setWebhook` again with the new token and the same HTTPS URL and secret.
5. Verify with `getWebhookInfo`, then perform the manual checks below.

Rotating the bot token does not relink user identities. Rotate
`TELEGRAM_WEBHOOK_SECRET` or `TELEGRAM_WORKER_SECRET` separately when needed,
then update the sender and receiver together to avoid rejected requests.

## Optional Destructive Integration Test

The live Supabase test is skipped unless it is pointed at a separate dedicated
test project and the exact guard below is present. Set these only in an
untracked test environment:

```text
SUPABASE_TEST_URL=<dedicated test project URL>
SUPABASE_TEST_SERVICE_ROLE_KEY=<dedicated test service role key>
SUPABASE_TEST_ANON_KEY=<dedicated test anon key>
SUPABASE_TEST_PROJECT_MARKER=<non-empty dedicated project marker>
SUPABASE_TEST_ALLOW_DESTRUCTIVE=I_UNDERSTAND_THIS_IS_A_DEDICATED_TEST_PROJECT
```

The test also refuses to run when `SUPABASE_TEST_URL` equals
`NEXT_PUBLIC_SUPABASE_URL`. It creates and deletes test users and data. Live
Supabase or Telegram tests were not run for this Task 6 verification without
dedicated credentials.

## Manual Verification

1. Apply migrations `001`, `002`, and `003` to a dedicated Supabase project.
2. Configure all server variables and restart the deployment.
3. Confirm `getWebhookInfo` shows the expected HTTPS URL.
4. Sign in to Centras Chat and create a Telegram link.
5. Open the link in Telegram and press Start; confirm the account shows active.
6. Enable Telegram notifications, set the recipient to `AWAY` or `OFFLINE`, and send a direct message from another account.
7. Run the worker and confirm the notification arrives once.
8. Reply with private text in the bot chat and confirm it appears in the linked direct conversation.
9. Re-deliver the same Telegram update and confirm no duplicate Centras message is created.
10. Disconnect the account and confirm new notifications and inbound messages are no longer relayed.

These are manual protocol checks. They must not be described as completed in
project status unless real Supabase and Telegram credentials were used.

## Explicit Scope Limits

Phone login, Mautrix, MTProto, Telegram user sessions, personal Telegram
inbox reading, group synchronization, and media/file relay are not supported.
