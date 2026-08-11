import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
