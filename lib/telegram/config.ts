import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

// This module contains server credentials and must never be evaluated in a browser bundle.
if (typeof window !== 'undefined') {
  throw new Error('Telegram configuration is server-only');
}

export interface TelegramRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface TelegramServerConfig {
  supabaseServiceRoleKey: string;
  botToken: string;
  botUsername: string;
  webhookSecret: string;
  webhookUrl: string;
  workerSecret: string;
  retry: TelegramRetryConfig;
}

// Keep retries finite so a failed Telegram delivery cannot create an unbounded queue.
export const DEFAULT_TELEGRAM_RETRY: Readonly<TelegramRetryConfig> = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
});

// Worker authentication requires a dedicated URL-safe secret of at least 32
// characters; shorter values are too easy to guess or accidentally reuse.
export const MIN_TELEGRAM_WORKER_SECRET_LENGTH = 32;

const REQUIRED_VARIABLES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_WEBHOOK_URL',
  'TELEGRAM_WORKER_SECRET',
] as const;

export function parseTelegramConfig(
  env: Readonly<Record<string, string | undefined>>,
): TelegramServerConfig {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required Telegram server configuration: ${missing.join(', ')}`);
  }

  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET as string;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    throw new Error('Invalid TELEGRAM_WEBHOOK_SECRET');
  }

  const botUsername = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? '';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(botUsername)) {
    throw new Error('Invalid TELEGRAM_BOT_USERNAME');
  }

  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim() ?? '';
  try {
    const parsedWebhookUrl = new URL(webhookUrl);
    if (
      parsedWebhookUrl.protocol !== 'https:' ||
      parsedWebhookUrl.username ||
      parsedWebhookUrl.password ||
      parsedWebhookUrl.hash
    ) {
      throw new Error('invalid webhook URL');
    }
  } catch {
    throw new Error('TELEGRAM_WEBHOOK_URL must be an HTTPS URL');
  }

  const workerSecret = env.TELEGRAM_WORKER_SECRET?.trim() ?? '';
  if (
    workerSecret.length < MIN_TELEGRAM_WORKER_SECRET_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(workerSecret)
  ) {
    throw new Error(
      `TELEGRAM_WORKER_SECRET must contain at least ${MIN_TELEGRAM_WORKER_SECRET_LENGTH} URL-safe characters`,
    );
  }

  return {
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    botToken: env.TELEGRAM_BOT_TOKEN as string,
    botUsername,
    webhookSecret,
    webhookUrl,
    workerSecret,
    retry: DEFAULT_TELEGRAM_RETRY,
  };
}

export function getTelegramConfig(): TelegramServerConfig {
  return parseTelegramConfig(process.env);
}

export function generateTelegramLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTelegramLinkToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
