import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getTelegramConfig, createTelegramUserScope, createTelegramLink, disconnectTelegramIdentity } = vi.hoisted(() => ({
  getTelegramConfig: vi.fn(),
  createTelegramUserScope: vi.fn(),
  createTelegramLink: vi.fn(),
  disconnectTelegramIdentity: vi.fn(),
}));

vi.mock('@/lib/telegram/config', () => ({ getTelegramConfig }));
vi.mock('@/lib/telegram/repository', () => ({
  createTelegramUserScope,
  createTelegramLink,
  disconnectTelegramIdentity,
  TelegramRepositoryError: class TelegramRepositoryError extends Error {
    constructor(public readonly code: string) {
      super('Telegram repository operation failed.');
    }
  },
}));

import { DELETE, POST } from './route';

const config = {
  supabaseServiceRoleKey: 'service-role-key',
  botToken: 'bot-token',
  botUsername: 'relay_bot',
  webhookSecret: 'webhook-secret',
  webhookUrl: 'https://example.test/api/telegram/webhook',
  workerSecret: 'worker-secret',
  retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000, maxRetryAfterMs: 300_000 },
};
const scope = { actorUserId: 'profile-1', ownerUserId: 'profile-1' };

function request(method: 'POST' | 'DELETE', token?: string): Request {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request('https://example.test/api/telegram/account', { method, headers });
}

beforeEach(() => {
  getTelegramConfig.mockReset().mockReturnValue(config);
  createTelegramUserScope.mockReset().mockResolvedValue(scope);
  createTelegramLink.mockReset().mockResolvedValue({ rawToken: 'raw-token', expiresAt: '2026-08-11T12:00:00.000Z' });
  disconnectTelegramIdentity.mockReset().mockResolvedValue(undefined);
});

describe('authenticated Telegram account route', () => {
  it('requires a bearer token for link creation', async () => {
    const response = await POST(request('POST'));

    expect(response.status).toBe(401);
    expect(createTelegramUserScope).not.toHaveBeenCalled();
  });

  it('verifies the current session token before creating a deep link', async () => {
    const response = await POST(request('POST', 'session-access-token'));

    expect(response.status).toBe(200);
    expect(createTelegramUserScope).toHaveBeenCalledWith('session-access-token');
    expect(createTelegramLink).toHaveBeenCalledWith(scope);
    expect(await response.json()).toEqual({
      deepLink: 'https://t.me/relay_bot?start=raw-token',
      expiresAt: '2026-08-11T12:00:00.000Z',
    });
  });

  it('does not return the raw token when repository creation fails', async () => {
    createTelegramLink.mockRejectedValueOnce(new Error('raw-token database details'));

    const response = await POST(request('POST', 'session-access-token'));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('raw-token');
  });

  it('routes disconnect through a verified current-user scope', async () => {
    const response = await DELETE(request('DELETE', 'session-access-token'));

    expect(response.status).toBe(200);
    expect(createTelegramUserScope).toHaveBeenCalledWith('session-access-token');
    expect(disconnectTelegramIdentity).toHaveBeenCalledWith(scope);
  });

  it('returns 401 when Supabase rejects the session token', async () => {
    const error = new Error('Telegram repository operation failed.') as Error & { code: string };
    error.code = 'AUTHENTICATION_ERROR';
    createTelegramUserScope.mockRejectedValueOnce(error);

    const response = await DELETE(request('DELETE', 'invalid-token'));

    expect(response.status).toBe(401);
    expect(disconnectTelegramIdentity).not.toHaveBeenCalled();
  });
});
