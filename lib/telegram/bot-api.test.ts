import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  TelegramBotApi,
  TelegramBotApiError,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from './bot-api';

describe('Telegram Bot API', () => {
  const token = '123456:secret-bot-token';
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('sends a bounded JSON sendMessage request', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
    );
    const api = new TelegramBotApi(token, fetchMock);
    const text = 'x'.repeat(TELEGRAM_MAX_MESSAGE_LENGTH + 20);

    await expect(
      api.sendMessage({ chatId: 987654321, text, disableWebPagePreview: true }),
    ).resolves.toEqual({ telegramMessageId: 42 });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${token}/sendMessage`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: 987654321,
          text: text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH),
          disable_web_page_preview: true,
        }),
      }),
    );
  });

  it('parses retry_after from a 429 response without exposing request data', async () => {
    const message = 'private message content';
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, description: `chat 987654321 rejected ${message}`, parameters: { retry_after: 17 } }),
        { status: 429 },
      ),
    );
    const api = new TelegramBotApi(token, fetchMock);

    const error = await api.sendMessage({ chatId: 987654321, text: message }).catch((value) => value);

    expect(error).toBeInstanceOf(TelegramBotApiError);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(17);
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain('987654321');
    expect(error.message).not.toContain(message);
  });

  it('falls back to the Retry-After header when the Telegram payload has no retry_after', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), {
        status: 429,
        headers: { 'retry-after': '23' },
      }),
    );
    const api = new TelegramBotApi(token, fetchMock);

    await expect(api.sendMessage({ chatId: 123, text: 'hello' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 23,
    });
  });

  it('ignores invalid fractional Retry-After values', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, parameters: { retry_after: 1.5 } }), {
        status: 429,
        headers: { 'retry-after': 'not-a-duration' },
      }),
    );
    const api = new TelegramBotApi(token, fetchMock);

    await expect(api.sendMessage({ chatId: 123, text: 'hello' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: undefined,
    });
  });

  it.each([
    null,
    { ok: true },
    { ok: true, result: {} },
    { ok: true, result: { message_id: '42' } },
  ])('rejects malformed successful responses: %j', async (payload) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const api = new TelegramBotApi(token, fetchMock);

    await expect(api.sendMessage({ chatId: 123, text: 'hello' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it.each([
    { chatId: 0, text: 'hello' },
    { chatId: '123', text: 'hello' },
    { chatId: 123, text: '' },
    { chatId: 123, text: 42 },
  ])('rejects invalid runtime input without making a request: %j', async (input) => {
    const api = new TelegramBotApi(token, fetchMock);

    await expect(api.sendMessage(input as never)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [500, 'SERVER_ERROR'],
    [400, 'CLIENT_ERROR'],
  ] as const)('maps HTTP %s to a safe typed error', async (status, code) => {
    fetchMock.mockResolvedValue(new Response('sensitive Telegram response', { status }));
    const api = new TelegramBotApi(token, fetchMock);

    const error = await api.sendMessage({ chatId: 123, text: 'secret text' }).catch((value) => value);

    expect(error).toBeInstanceOf(TelegramBotApiError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain('123');
    expect(error.message).not.toContain('secret text');
  });

  it('maps fetch failures to a safe network error', async () => {
    fetchMock.mockRejectedValue(new Error(`token=${token}`));
    const api = new TelegramBotApi(token, fetchMock);

    await expect(api.sendMessage({ chatId: 123, text: 'secret text' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Telegram request failed.',
    });
  });

  it('aborts a request at its bounded timeout and returns a safe timeout error', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const api = new TelegramBotApi(token);
    const requestPromise = api.sendMessage({ chatId: 123, text: 'secret text', timeoutMs: 100 });
    const errorPromise = requestPromise.catch(error => error);

    await vi.advanceTimersByTimeAsync(100);

    const error = await errorPromise;
    expect(error).toMatchObject({
      code: 'TIMEOUT',
      message: 'Telegram request timed out.',
    });
    expect(error.message).not.toContain(token);
    vi.useRealTimers();
  });

  it.each(['./bot-api', './server-client', './repository'])(
    'enforces the server-only boundary for %s', async (modulePath) => {
      vi.stubGlobal('window', {});
      vi.resetModules();

      try {
        await expect(import(modulePath)).rejects.toThrow(/server-only/);
      } finally {
        vi.unstubAllGlobals();
        vi.resetModules();
      }
    },
  );
});
