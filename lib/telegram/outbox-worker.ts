import 'server-only';

import { sendTelegramMessage, TelegramBotApiError } from './bot-api';
import { getTelegramConfig, type TelegramRetryConfig } from './config';
import {
  completeOutbox,
  failOutbox,
  leaseOutbox,
  type CompleteOutboxInput,
  type FailOutboxInput,
  type LeaseOutboxInput,
} from './repository';
import type { TelegramNotificationOutbox } from '@/types';

export interface OutboxWorkerCounts {
  leased: number;
  sent: number;
  retried: number;
  failed: number;
}

export interface OutboxWorkerDependencies {
  leaseOutbox: (input?: LeaseOutboxInput) => Promise<TelegramNotificationOutbox[]>;
  completeOutbox: (input: CompleteOutboxInput) => Promise<boolean>;
  failOutbox: (input: FailOutboxInput) => Promise<boolean>;
  sendTelegramMessage: typeof sendTelegramMessage;
  now?: () => number;
  random?: () => number;
}

export interface ProcessTelegramOutboxOptions {
  limit?: number;
  leaseSeconds?: number;
  retry?: TelegramRetryConfig;
  dependencies?: Partial<OutboxWorkerDependencies>;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_LEASE_SECONDS = 60;

const defaultDependencies: OutboxWorkerDependencies = {
  leaseOutbox,
  completeOutbox,
  failOutbox,
  sendTelegramMessage,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeSendErrorCode(error: unknown): string {
  if (error instanceof TelegramBotApiError) return error.code;
  if (isRecord(error) && typeof error.code === 'string' && /^[A-Za-z0-9:_-]{1,64}$/.test(error.code)) {
    return error.code;
  }
  return 'NETWORK_ERROR';
}

function retryable(error: unknown): boolean {
  const code = safeSendErrorCode(error);
  return code === 'NETWORK_ERROR' || code === 'RATE_LIMITED' || code === 'SERVER_ERROR' || code === 'INVALID_RESPONSE';
}

function retryAfterSeconds(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const value = error.retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function retryDelayMs(
  row: TelegramNotificationOutbox,
  retry: TelegramRetryConfig,
  random: () => number,
): number {
  const exponent = Math.max(0, row.attempts - 1);
  const exponential = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** exponent);
  const jitter = Math.floor(exponential * 0.2 * Math.min(Math.max(random(), 0), 1));
  return Math.min(retry.maxDelayMs, exponential + jitter);
}

function retryAtFor(
  row: TelegramNotificationOutbox,
  error: unknown,
  retry: TelegramRetryConfig,
  now: number,
  random: () => number,
): Date {
  const retryAfter = retryAfterSeconds(error);
  const delay = retryAfter === undefined
    ? retryDelayMs(row, retry, random)
    : Math.max(retryAfter * 1_000, retryDelayMs(row, retry, random));
  return new Date(now + delay);
}

function payloadText(row: TelegramNotificationOutbox): string | null {
  if (!isRecord(row.payload) || typeof row.payload.text !== 'string' || row.payload.text.length === 0) {
    return null;
  }
  return row.payload.text;
}

export async function processTelegramOutbox(
  options: ProcessTelegramOutboxOptions = {},
): Promise<OutboxWorkerCounts> {
  const retry = options.retry ?? getTelegramConfig().retry;
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const now = dependencies.now ?? Date.now;
  const random = dependencies.random ?? Math.random;
  const rows = await dependencies.leaseOutbox({
    limit: options.limit ?? DEFAULT_LIMIT,
    leaseSeconds: options.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  });
  const counts: OutboxWorkerCounts = { leased: rows.length, sent: 0, retried: 0, failed: 0 };

  for (const row of rows) {
    const leaseToken = row.lease_token;
    if (typeof leaseToken !== 'string' || !leaseToken) {
      counts.failed += 1;
      continue;
    }

    const text = payloadText(row);
    if (text === null) {
      await dependencies.failOutbox({ id: row.id, leaseToken, errorCode: 'INVALID_PAYLOAD', retryAt: null });
      counts.failed += 1;
      continue;
    }

    try {
      const result = await dependencies.sendTelegramMessage({ chatId: row.telegram_chat_id, text });
      await dependencies.completeOutbox({
        id: row.id,
        leaseToken,
        telegramMessageId: result.telegramMessageId,
      });
      counts.sent += 1;
    } catch (error) {
      const errorCode = safeSendErrorCode(error);
      const canRetry = retryable(error) && row.attempts < Math.min(row.max_attempts, retry.maxAttempts);
      const retryAt = canRetry
        ? retryAtFor(row, error, retry, now(), random)
        : null;
      await dependencies.failOutbox({ id: row.id, leaseToken, errorCode, retryAt });
      if (canRetry) counts.retried += 1;
      else counts.failed += 1;
    }
  }

  return counts;
}
