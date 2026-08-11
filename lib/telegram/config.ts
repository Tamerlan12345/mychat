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

  return {
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    botToken: env.TELEGRAM_BOT_TOKEN as string,
    botUsername: env.TELEGRAM_BOT_USERNAME as string,
    webhookSecret,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL as string,
    workerSecret: env.TELEGRAM_WORKER_SECRET as string,
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
