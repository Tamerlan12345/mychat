import { createHash, timingSafeEqual } from 'node:crypto';

import { TelegramBotApi } from '@/lib/telegram/bot-api';
import { getTelegramConfig, hashTelegramLinkToken } from '@/lib/telegram/config';
import {
  claimTelegramLink,
  ingestTelegramInbound,
  TelegramRepositoryError,
} from '@/lib/telegram/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INBOUND_TEXT_LENGTH = 4_096;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type TelegramRecord = Record<string, unknown>;

function isRecord(value: unknown): value is TelegramRecord {
  return typeof value === 'object' && value !== null;
}

function safeResponse(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

function methodNotAllowed(): Response {
  return safeResponse(405, { Allow: 'POST' });
}

function safeSecretMatches(received: string, expected: string): boolean {
  const receivedDigest = createHash('sha256').update(received, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function privateMessage(update: unknown): TelegramRecord | null {
  if (!isRecord(update) || !isRecord(update.message)) return null;

  const message = update.message;
  const chat = message.chat;
  const from = message.from;
  if (!isRecord(chat) || !isRecord(from)) return null;
  if (chat.type !== 'private' || chat.id !== from.id) return null;
  if (!positiveSafeInteger(chat.id) || !positiveSafeInteger(from.id)) return null;

  return message;
}

function textContent(message: TelegramRecord): string | null {
  const unsupportedMediaKeys = [
    'audio',
    'document',
    'animation',
    'photo',
    'sticker',
    'video',
    'video_note',
    'voice',
  ];
  if (unsupportedMediaKeys.some(key => key in message)) return null;

  const value = typeof message.text === 'string' ? message.text : message.caption;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_INBOUND_TEXT_LENGTH) {
    return null;
  }
  return value;
}

function replyToTelegramMessageId(message: TelegramRecord): number | null {
  if (!('reply_to_message' in message)) return null;
  const reply = message.reply_to_message;
  if (!isRecord(reply) || !positiveSafeInteger(reply.message_id)) return null;
  return reply.message_id;
}

function startPayload(
  content: string,
  botUsername: string,
): { isStart: boolean; payload?: string } {
  const trimmed = content.trim();
  if (!/^\/start(?:@|\s|$)/i.test(trimmed)) return { isStart: false };

  const match = /^\/start(?:@([A-Za-z0-9_]{1,64}))?(?:\s+([^\s]+))?\s*$/i.exec(trimmed);
  if (!match) return { isStart: true };

  const requestedBot = match[1];
  const normalizedBot = botUsername.replace(/^@/, '').toLowerCase();
  if (requestedBot && requestedBot.toLowerCase() !== normalizedBot) return { isStart: true };

  const payload = match[2];
  return payload && TOKEN_PATTERN.test(payload) ? { isStart: true, payload } : { isStart: true };
}

function repositoryErrorCode(error: unknown): string | undefined {
  if (error instanceof TelegramRepositoryError) return error.code;
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  return undefined;
}

async function handleWebhook(request: Request): Promise<Response> {
  const receivedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!receivedSecret) return safeResponse(401);

  let config: ReturnType<typeof getTelegramConfig>;
  try {
    config = getTelegramConfig();
  } catch {
    return safeResponse(503);
  }

  if (!safeSecretMatches(receivedSecret, config.webhookSecret)) return safeResponse(401);

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return safeResponse(400);
  }

  const message = privateMessage(update);
  if (!message) return safeResponse(200);

  const content = textContent(message);
  if (!content) return safeResponse(200);

  const chat = message.chat as TelegramRecord;
  const from = message.from as TelegramRecord;
  const chatId = chat.id as number;
  const telegramUserId = from.id as number;
  const messageId = message.message_id;

  if (!positiveSafeInteger(messageId)) return safeResponse(200);

  const start = startPayload(content, config.botUsername);
  if (start.isStart) {
    if (!start.payload) return safeResponse(200);

    let claimedIdentity;
    try {
      claimedIdentity = await claimTelegramLink({
        tokenHash: hashTelegramLinkToken(start.payload),
        telegramUserId,
        telegramChatId: chatId,
        username: typeof from.username === 'string' ? from.username : null,
      });
    } catch (error) {
      if (repositoryErrorCode(error) === 'CONFLICT') return safeResponse(200);
      return safeResponse(500);
    }

    if (!claimedIdentity) return safeResponse(200);

    try {
      await new TelegramBotApi(config.botToken).sendMessage({
        chatId,
        text: 'Your Telegram account is now linked to Centras Chat.',
        disableWebPagePreview: true,
      });
    } catch {
      // The identity and token claim are already committed. Never retry the token claim.
      console.warn('Telegram link confirmation delivery failed after commit.');
    }
    return safeResponse(200);
  }

  try {
    await ingestTelegramInbound({
      telegramUserId,
      telegramChatId: chatId,
      telegramMessageId: messageId,
      content,
      replyToTelegramMessageId: replyToTelegramMessageId(message),
    });
  } catch (error) {
    const code = repositoryErrorCode(error);
    if (code === 'IDENTITY_NOT_LINKED' || code === 'NO_DIRECT_CONVERSATION') return safeResponse(200);
    return safeResponse(500);
  }

  return safeResponse(200);
}

export async function POST(request: Request): Promise<Response> {
  return handleWebhook(request);
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
  return methodNotAllowed();
}

export async function HEAD(): Promise<Response> {
  return methodNotAllowed();
}
