import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  DEFAULT_TELEGRAM_RETRY,
  MIN_TELEGRAM_WORKER_SECRET_LENGTH,
  generateTelegramLinkToken,
  getTelegramConfig,
  hashTelegramLinkToken,
  parseTelegramConfig,
} from './config';

const validEnvironment = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_BOT_USERNAME: 'relay_bot',
  TELEGRAM_WEBHOOK_SECRET: 'valid_secret-123',
  TELEGRAM_WEBHOOK_URL: 'https://chat.example.com/api/telegram/webhook',
  TELEGRAM_WORKER_SECRET: 'w'.repeat(32),
};

describe('Telegram server configuration', () => {
  it('fails closed when a required server variable is missing', () => {
    const { TELEGRAM_BOT_TOKEN: _, ...missingToken } = validEnvironment;

    expect(() => parseTelegramConfig(missingToken)).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('parses valid server variables without exposing public aliases', () => {
    const config = parseTelegramConfig(validEnvironment);

    expect(config).toEqual({
      supabaseServiceRoleKey: 'service-role-key',
      botToken: 'bot-token',
      botUsername: 'relay_bot',
      webhookSecret: 'valid_secret-123',
      webhookUrl: 'https://chat.example.com/api/telegram/webhook',
       workerSecret: 'w'.repeat(32),
      retry: DEFAULT_TELEGRAM_RETRY,
    });
  });

  it('rejects webhook secrets containing characters outside Telegram allowed characters', () => {
    expect(() =>
      parseTelegramConfig({ ...validEnvironment, TELEGRAM_WEBHOOK_SECRET: 'not valid!' }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it('accepts the shortest and longest valid webhook secrets', () => {
    expect(() => parseTelegramConfig({ ...validEnvironment, TELEGRAM_WEBHOOK_SECRET: 'A' })).not.toThrow();
    expect(() =>
      parseTelegramConfig({ ...validEnvironment, TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(256) }),
    ).not.toThrow();
  });

  it('keeps retry defaults bounded', () => {
    expect(DEFAULT_TELEGRAM_RETRY.maxAttempts).toBeGreaterThan(0);
    expect(DEFAULT_TELEGRAM_RETRY.maxAttempts).toBeLessThanOrEqual(10);
    expect(DEFAULT_TELEGRAM_RETRY.baseDelayMs).toBeGreaterThan(0);
    expect(DEFAULT_TELEGRAM_RETRY.baseDelayMs).toBeLessThanOrEqual(60_000);
    expect(DEFAULT_TELEGRAM_RETRY.maxDelayMs).toBeGreaterThanOrEqual(DEFAULT_TELEGRAM_RETRY.baseDelayMs);
    expect(DEFAULT_TELEGRAM_RETRY.maxDelayMs).toBeLessThanOrEqual(300_000);
  });

  it('trims and requires a strong worker secret', () => {
    const paddedSecret = `  ${'s'.repeat(MIN_TELEGRAM_WORKER_SECRET_LENGTH)}  `;
    const config = parseTelegramConfig({ ...validEnvironment, TELEGRAM_WORKER_SECRET: paddedSecret });

    expect(config.workerSecret).toBe('s'.repeat(MIN_TELEGRAM_WORKER_SECRET_LENGTH));
    expect(() => parseTelegramConfig({ ...validEnvironment, TELEGRAM_WORKER_SECRET: 'too-short' })).toThrow(
      new RegExp(`${MIN_TELEGRAM_WORKER_SECRET_LENGTH}`),
    );
  });

  it('generates a URL-safe raw token and persists only its SHA-256 hash', () => {
    const rawToken = generateTelegramLinkToken();

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(rawToken).not.toBe(hashTelegramLinkToken(rawToken));
    expect(hashTelegramLinkToken(rawToken)).toMatch(/^[a-f0-9]{64}$/);
    expect(generateTelegramLinkToken()).not.toBe(rawToken);
  });

  it('loads configuration from process environment', () => {
    const original = Object.fromEntries(
      Object.keys(validEnvironment).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, validEnvironment);

    try {
      expect(getTelegramConfig()).toEqual(parseTelegramConfig(validEnvironment));
    } finally {
      for (const name of Object.keys(validEnvironment)) {
        if (original[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = original[name];
        }
      }
    }
  });

  it('fails closed when imported in a browser', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();

    try {
      await expect(import('./config')).rejects.toThrow(/server-only/);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
