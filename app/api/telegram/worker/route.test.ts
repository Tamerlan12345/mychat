import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getTelegramConfig, processTelegramOutbox } = vi.hoisted(() => ({
  getTelegramConfig: vi.fn(),
  processTelegramOutbox: vi.fn(),
}));

vi.mock('@/lib/telegram/config', () => ({ getTelegramConfig }));
vi.mock('@/lib/telegram/outbox-worker', () => ({ processTelegramOutbox }));

import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from './route';

const config = {
  supabaseServiceRoleKey: 'service-role-key',
  botToken: 'bot-token',
  botUsername: 'relay_bot',
  webhookSecret: 'webhook-secret',
  webhookUrl: 'https://example.test/api/telegram/webhook',
  workerSecret: 'worker-secret',
  retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
};

function request(method = 'POST', secret?: string): Request {
  const headers = new Headers();
  if (secret !== undefined) headers.set('X-Worker-Secret', secret);
  return new Request('https://example.test/api/telegram/worker', { method, headers });
}

beforeEach(() => {
  getTelegramConfig.mockReset().mockReturnValue(config);
  processTelegramOutbox.mockReset().mockResolvedValue({
    leased: 2, sent: 1, retried: 1, failed: 0, ambiguous: 0, corrupt: 0,
  });
});

describe('Telegram worker route', () => {
  it.each([
    ['GET', GET], ['PUT', PUT], ['PATCH', PATCH], ['DELETE', DELETE], ['OPTIONS', OPTIONS], ['HEAD', HEAD],
  ])('rejects %s with Allow: POST', async (_method, handler) => {
    const response = await (handler as (request: Request) => Promise<Response>)(request(_method));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('returns 503 when server configuration is missing', async () => {
    getTelegramConfig.mockImplementationOnce(() => { throw new Error('missing TELEGRAM_WORKER_SECRET=secret'); });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('TELEGRAM_WORKER_SECRET');
    expect(processTelegramOutbox).not.toHaveBeenCalled();
  });

  it.each([undefined, 'wrong-secret'])('returns 401 for a missing or wrong worker secret', async secret => {
    const response = await POST(request('POST', secret));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(config.workerSecret);
    expect(processTelegramOutbox).not.toHaveBeenCalled();
  });

  it('processes a bounded batch and returns safe counts', async () => {
    const response = await POST(request('POST', config.workerSecret));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      leased: 2, sent: 1, retried: 1, failed: 0, ambiguous: 0, corrupt: 0,
    });
    expect(processTelegramOutbox).toHaveBeenCalledWith({ retry: config.retry });
  });

  it('surfaces ambiguous and corrupt rows without exposing row data', async () => {
    processTelegramOutbox.mockResolvedValueOnce({
      leased: 2, sent: 0, retried: 0, failed: 0, ambiguous: 1, corrupt: 1,
    });

    const response = await POST(request('POST', config.workerSecret));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      leased: 2, sent: 0, retried: 0, failed: 0, ambiguous: 1, corrupt: 1,
    });
    expect(body).not.toContain('lease_token');
  });
});
