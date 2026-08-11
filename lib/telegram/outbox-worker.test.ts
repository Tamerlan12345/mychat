import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('server-only', () => ({}));

import {
  processTelegramOutbox,
  type OutboxWorkerDependencies,
} from './outbox-worker';
import type { TelegramNotificationOutbox } from '@/types';
import { TelegramBotApiError } from './bot-api';

const migration = readFileSync(
  new URL('../../supabase/migrations/003_telegram_bot_relay.sql', import.meta.url),
  'utf8',
);

const retryConfig = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 };
const now = 1_755_000_000_000;

function row(overrides: Partial<TelegramNotificationOutbox> = {}): TelegramNotificationOutbox {
  return {
    id: 'outbox-1',
    profile_id: 'profile-1',
    idempotency_key: 'message-1:profile-1',
    telegram_chat_id: 987654321,
    payload: { text: 'Alice: hello' },
    status: 'leased',
    attempts: 1,
    max_attempts: 5,
    next_attempt_at: new Date(now).toISOString(),
    lease_token: 'lease-1',
    leased_until: new Date(now + 60_000).toISOString(),
    telegram_message_id: null,
    last_error_code: null,
    sent_at: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    ...overrides,
  };
}

function dependencies(
  leasedRows: TelegramNotificationOutbox[] = [row()],
): OutboxWorkerDependencies & {
  leaseOutbox: ReturnType<typeof vi.fn>;
  completeOutbox: ReturnType<typeof vi.fn>;
  failOutbox: ReturnType<typeof vi.fn>;
  sendTelegramMessage: ReturnType<typeof vi.fn>;
} {
  return {
    leaseOutbox: vi.fn().mockResolvedValue(leasedRows),
    completeOutbox: vi.fn().mockResolvedValue(true),
    failOutbox: vi.fn().mockResolvedValue(true),
    sendTelegramMessage: vi.fn().mockResolvedValue({ telegramMessageId: 42 }),
    now: () => now,
    random: () => 0.5,
  };
}

describe('Telegram outbox worker', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sends a leased row and completes it with Telegram message ID', async () => {
    const deps = dependencies();

    await expect(
      processTelegramOutbox({ limit: 4, leaseSeconds: 30, retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 1, retried: 0, failed: 0, ambiguous: 0, corrupt: 0 });

    expect(deps.leaseOutbox).toHaveBeenCalledWith({ limit: 4, leaseSeconds: 30 });
    expect(deps.sendTelegramMessage).toHaveBeenCalledWith({
      chatId: 987654321,
      text: 'Alice: hello',
      timeoutMs: 29_000,
    });
    expect(deps.completeOutbox).toHaveBeenCalledWith({
      id: 'outbox-1',
      leaseToken: 'lease-1',
      telegramMessageId: 42,
    });
  });

  it('retries network failures without exposing the failure details', async () => {
    const deps = dependencies();
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('NETWORK_ERROR'));

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 1, failed: 0, ambiguous: 0, corrupt: 0 });

    expect(deps.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      id: 'outbox-1',
      leaseToken: 'lease-1',
      errorCode: 'NETWORK_ERROR',
      retryAt: new Date(now + 1_100),
    }));
  });

  it('honors Telegram retry_after for HTTP 429', async () => {
    const deps = dependencies();
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('RATE_LIMITED', 429, 17));

    await processTelegramOutbox({ retry: retryConfig, dependencies: deps });

    expect(deps.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'RATE_LIMITED',
      retryAt: new Date(now + 17_000),
    }));
  });

  it('uses bounded exponential backoff with jitter for HTTP 5xx', async () => {
    const deps = dependencies([row({ attempts: 3 })]);
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('SERVER_ERROR', 503));

    await processTelegramOutbox({ retry: retryConfig, dependencies: deps });

    expect(deps.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'SERVER_ERROR',
      retryAt: new Date(now + 4_400),
    }));
  });

  it('marks permanent Telegram 4xx errors failed without retrying', async () => {
    const deps = dependencies();
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('CLIENT_ERROR', 400));

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 1, ambiguous: 0, corrupt: 0 });

    expect(deps.failOutbox).toHaveBeenCalledWith({
      id: 'outbox-1',
      leaseToken: 'lease-1',
      errorCode: 'CLIENT_ERROR',
      retryAt: null,
    });
  });

  it('stops retrying when the leased row reaches max attempts', async () => {
    const deps = dependencies([row({ attempts: 5, max_attempts: 5 })]);
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('NETWORK_ERROR'));

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 1, ambiguous: 0, corrupt: 0 });

    expect(deps.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'NETWORK_ERROR',
      retryAt: null,
    }));
  });

  it('keeps malformed payloads from reaching the Bot API', async () => {
    const deps = dependencies([row({ payload: { content: 'not the worker field' } })]);

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 1, ambiguous: 0, corrupt: 0 });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
    expect(deps.failOutbox).toHaveBeenCalledWith({
      id: 'outbox-1',
      leaseToken: 'lease-1',
      errorCode: 'INVALID_PAYLOAD',
      retryAt: null,
    });
  });

  it('normalizes unexpected send failures without retaining sensitive details', async () => {
    const deps = dependencies();
    deps.sendTelegramMessage.mockRejectedValueOnce(new Error('bot-token=secret chat=987654321 content=private'));

    await processTelegramOutbox({ retry: retryConfig, dependencies: deps });

    expect(deps.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'NETWORK_ERROR',
    }));
    expect(JSON.stringify(deps.failOutbox.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(deps.failOutbox.mock.calls)).not.toContain('private');
  });

  it('surfaces an ambiguous result when completion is not confirmed', async () => {
    const deps = dependencies();
    deps.completeOutbox.mockResolvedValueOnce(false);

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 0, ambiguous: 1, corrupt: 0 });

    expect(deps.failOutbox).not.toHaveBeenCalled();
  });

  it('does not classify completion persistence errors as Telegram send errors', async () => {
    const deps = dependencies();
    deps.completeOutbox.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toMatchObject({ sent: 0, retried: 0, failed: 0, ambiguous: 1, corrupt: 0 });

    expect(deps.failOutbox).not.toHaveBeenCalled();
  });

  it('surfaces failure-transition persistence errors without claiming a retry', async () => {
    const deps = dependencies();
    deps.sendTelegramMessage.mockRejectedValueOnce(new TelegramBotApiError('NETWORK_ERROR'));
    deps.failOutbox.mockResolvedValueOnce(false);

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 0, ambiguous: 1, corrupt: 0 });
  });

  it('surfaces a leased row without a lease token as corruption', async () => {
    const deps = dependencies([row({ lease_token: null })]);

    await expect(
      processTelegramOutbox({ retry: retryConfig, dependencies: deps }),
    ).resolves.toEqual({ leased: 1, sent: 0, retried: 0, failed: 0, ambiguous: 0, corrupt: 1 });

    expect(deps.sendTelegramMessage).not.toHaveBeenCalled();
    expect(deps.failOutbox).not.toHaveBeenCalled();
  });

  it('passes bounded lease arguments and processes reclaimed expired rows', async () => {
    const deps = dependencies([row({ status: 'leased', leased_until: new Date(now - 1).toISOString() })]);

    await processTelegramOutbox({ limit: 10_000, leaseSeconds: 10_000, retry: retryConfig, dependencies: deps });

    expect(deps.leaseOutbox).toHaveBeenCalledWith({ limit: 10_000, leaseSeconds: 3_600 });
    expect(deps.sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it('does not double-process rows excluded by the database lease', async () => {
    let available = [row()];
    const lease = vi.fn().mockImplementation(async () => {
      const leased = available;
      available = [];
      return leased;
    });
    const first = dependencies();
    const second = dependencies();
    first.leaseOutbox = lease;
    second.leaseOutbox = lease;

    const [firstResult, secondResult] = await Promise.all([
      processTelegramOutbox({ retry: retryConfig, dependencies: first }),
      processTelegramOutbox({ retry: retryConfig, dependencies: second }),
    ]);

    expect(firstResult.leased + secondResult.leased).toBe(1);
    expect(first.sendTelegramMessage.mock.calls.length + second.sendTelegramMessage.mock.calls.length).toBe(1);
  });
});

describe('Telegram outbox migration contract', () => {
  it('enqueues only eligible direct recipients atomically from message inserts', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION enqueue_telegram_notification\(\)/);
    expect(migration).toMatch(/c\.type = 'DIRECT'/);
    expect(migration).toMatch(/p\.status IN \('OFFLINE', 'AWAY'\)/);
    expect(migration).toMatch(/ti\.status = 'active'/);
    expect(migration).toMatch(/us\.telegram_enabled = TRUE/);
    expect(migration).toMatch(/CREATE TRIGGER enqueue_telegram_notification_after_insert/);
    expect(migration).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/);
  });

  it('does not expose the trigger or outbox mutations to browser roles', () => {
    expect(migration).toMatch(/REVOKE ALL ON telegram_link_tokens, telegram_identities,\s+telegram_relay_log, telegram_notification_outbox FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION enqueue_telegram_notification\(\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(migration).toMatch(/status = 'leased' AND leased_until < NOW\(\)/);
  });

  it('excludes connected recipients and recipients with disabled settings', () => {
    expect(migration).toMatch(/p\.status IN \('OFFLINE', 'AWAY'\)/);
    expect(migration).not.toMatch(/p\.status IN \([^)]*ONLINE/);
    expect(migration).toMatch(/us\.telegram_enabled = TRUE/);
    expect(migration).not.toMatch(/us\.telegram_enabled = TRUE\s+OR/);
  });
});
