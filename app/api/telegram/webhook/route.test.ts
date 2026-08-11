import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getTelegramConfig, hashTelegramLinkToken, claimTelegramLink, ingestTelegramInbound, sendMessage } =
  vi.hoisted(() => ({
    getTelegramConfig: vi.fn(),
    hashTelegramLinkToken: vi.fn((token: string) => `hash:${token}`),
    claimTelegramLink: vi.fn(),
    ingestTelegramInbound: vi.fn(),
    sendMessage: vi.fn(),
  }));

vi.mock('@/lib/telegram/config', () => ({
  getTelegramConfig,
  hashTelegramLinkToken,
}));

vi.mock('@/lib/telegram/repository', () => ({
  claimTelegramLink,
  ingestTelegramInbound,
  TelegramRepositoryError: class TelegramRepositoryError extends Error {
    constructor(public readonly code: string) {
      super('Telegram repository operation failed.');
    }
  },
}));

vi.mock('@/lib/telegram/bot-api', () => ({
  TelegramBotApi: class {
    constructor(public readonly token: string) {}

    sendMessage = sendMessage;
  },
}));

import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from './route';

const config = {
  supabaseServiceRoleKey: 'service-role-key',
  botToken: 'bot-token',
  botUsername: 'relay_bot',
  webhookSecret: 'webhook-secret',
  webhookUrl: 'https://chat.example.com/api/telegram/webhook',
  workerSecret: 'worker-secret',
  retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
};

function request(body: unknown, secret = config.webhookSecret): Request {
  return new Request('https://chat.example.com/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function privateUpdate(content: Record<string, unknown>, messageId = 11): Record<string, unknown> {
  return {
    update_id: 100,
    message: {
      message_id: messageId,
      chat: { id: 42, type: 'private' },
      from: { id: 42, username: 'relay_user' },
      ...content,
    },
  };
}

beforeEach(() => {
  getTelegramConfig.mockReset().mockReturnValue(config);
  hashTelegramLinkToken.mockClear();
  claimTelegramLink.mockReset().mockResolvedValue(null);
  ingestTelegramInbound.mockReset().mockResolvedValue({ id: 'message-1' });
  sendMessage.mockReset().mockResolvedValue({ telegramMessageId: 77 });
});

describe('Telegram webhook route', () => {
  it.each([
    ['GET', GET],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
    ['OPTIONS', OPTIONS],
    ['HEAD', HEAD],
  ])('rejects %s with Allow: POST', async (_method, handler) => {
    const response = await (handler as (request: Request) => Promise<Response>)(
      new Request('https://example.test/api/telegram/webhook'),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it.each([undefined, 'wrong-secret'])('rejects a missing or wrong secret with 401', async (secret) => {
    const incomingRequest = request({ update_id: 1 }, secret ?? config.webhookSecret);
    if (secret === undefined) incomingRequest.headers.delete('X-Telegram-Bot-Api-Secret-Token');
    const response = await POST(incomingRequest);

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(config.webhookSecret);
    expect(claimTelegramLink).not.toHaveBeenCalled();
  });

  it('fails with 503 before repository or Bot API work when config is missing', async () => {
    getTelegramConfig.mockImplementationOnce(() => {
      throw new Error('missing TELEGRAM_BOT_TOKEN=secret');
    });

    const response = await POST(request({ update_id: 1 }));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('TELEGRAM_BOT_TOKEN');
    expect(claimTelegramLink).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON without exposing the parser exception', async () => {
    const response = await POST(request('{not-json}'));

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('not-json');
  });

  it.each([
    '/start token-1',
    '/start@relay_bot token-1',
  ])('claims %s and sends a safe confirmation', async (text) => {
    claimTelegramLink.mockResolvedValueOnce({
      id: 'identity-1',
      profile_id: 'profile-1',
      telegram_user_id: 42,
      telegram_chat_id: 42,
      username: 'relay_user',
      status: 'active',
    });

    const response = await POST(request(privateUpdate({ text })));

    expect(response.status).toBe(200);
    expect(claimTelegramLink).toHaveBeenCalledWith({
      tokenHash: 'hash:token-1',
      telegramUserId: 42,
      telegramChatId: 42,
      username: 'relay_user',
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 42, text: expect.any(String) }),
    );
    expect(await response.text()).not.toContain('token-1');
  });

  it('ignores /start without a payload and malformed or expired tokens', async () => {
    for (const text of ['/start', '/start expired!', '/start token-1 extra']) {
      const response = await POST(request(privateUpdate({ text })));

      expect(response.status).toBe(200);
    }

    expect(claimTelegramLink).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('acknowledges a confirmation API failure after the link is committed', async () => {
    claimTelegramLink.mockResolvedValueOnce({
      id: 'identity-1',
      profile_id: 'profile-1',
      telegram_user_id: 42,
      telegram_chat_id: 42,
      username: null,
      status: 'active',
    });
    sendMessage.mockRejectedValueOnce(new Error('bot-token=secret and chat=42'));

    await expect(POST(request(privateUpdate({ text: '/start token-1' })))).resolves.toMatchObject({
      status: 200,
    });
  });

  it('acknowledges a duplicate start after the atomic claim returns no row', async () => {
    claimTelegramLink.mockResolvedValueOnce(null);

    const response = await POST(request(privateUpdate({ text: '/start token-1' })));

    expect(response.status).toBe(200);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('acknowledges unknown identities without creating a profile', async () => {
    const repositoryError = new Error('Telegram repository operation failed.') as Error & { code: string };
    repositoryError.code = 'IDENTITY_NOT_LINKED';
    ingestTelegramInbound.mockRejectedValueOnce(repositoryError);

    const response = await POST(request(privateUpdate({ text: 'hello from Telegram' })));

    expect(response.status).toBe(200);
    expect(ingestTelegramInbound).toHaveBeenCalledWith({
      telegramUserId: 42,
      telegramChatId: 42,
      telegramMessageId: 11,
      content: 'hello from Telegram',
    });
  });

  it('ignores group updates without calling repository operations', async () => {
    const response = await POST(
      request({
        update_id: 100,
        message: {
          message_id: 11,
          chat: { id: -42, type: 'group' },
          from: { id: 42, username: 'relay_user' },
          text: 'do not relay',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(ingestTelegramInbound).not.toHaveBeenCalled();
    expect(claimTelegramLink).not.toHaveBeenCalled();
  });

  it.each([
    { text: 'private text' },
    { caption: 'private caption' },
  ])('ingests private %s content', async (content) => {
    const response = await POST(request(privateUpdate(content)));

    expect(response.status).toBe(200);
    expect(ingestTelegramInbound).toHaveBeenCalledWith({
      telegramUserId: 42,
      telegramChatId: 42,
      telegramMessageId: 11,
      content: Object.values(content)[0],
    });
  });

  it('returns 500 for database failure before a link commit with a safe body', async () => {
    claimTelegramLink.mockRejectedValueOnce(new Error('database secret=private-id-42'));

    const response = await POST(request(privateUpdate({ text: '/start token-1' })));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private-id-42');
  });
});
