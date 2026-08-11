import 'server-only';

import { getTelegramConfig } from './config';

if (typeof window !== 'undefined') {
  throw new Error('Telegram Bot API is server-only');
}

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4_096;

export type TelegramBotApiErrorCode =
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'TELEGRAM_ERROR';

export interface TelegramSendMessageInput {
  chatId: number;
  text: string;
  disableWebPagePreview?: boolean;
}

export interface TelegramSendMessageResult {
  telegramMessageId: number;
}

export class TelegramBotApiError extends Error {
  constructor(
    public readonly code: TelegramBotApiErrorCode,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(TELEGRAM_ERROR_MESSAGES[code]);
    this.name = 'TelegramBotApiError';
  }
}

const TELEGRAM_ERROR_MESSAGES: Record<TelegramBotApiErrorCode, string> = {
  INVALID_REQUEST: 'Telegram request is invalid.',
  RATE_LIMITED: 'Telegram request was rate limited.',
  SERVER_ERROR: 'Telegram service is temporarily unavailable.',
  CLIENT_ERROR: 'Telegram rejected the request.',
  NETWORK_ERROR: 'Telegram request failed.',
  INVALID_RESPONSE: 'Telegram returned an invalid response.',
  TELEGRAM_ERROR: 'Telegram rejected the request.',
};

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRetryAfterSeconds(payload: unknown, response: Response): number | undefined {
  if (isRecord(payload) && isRecord(payload.parameters)) {
    const retryAfter = payload.parameters.retry_after;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0) {
      return Math.floor(retryAfter);
    }
  }

  const retryAfterHeader = response.headers.get('retry-after');
  if (!retryAfterHeader) return undefined;
  const retryAfter = Number(retryAfterHeader);
  return Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.floor(retryAfter) : undefined;
}

function boundedText(text: string): string {
  return Array.from(text).slice(0, TELEGRAM_MAX_MESSAGE_LENGTH).join('');
}

export class TelegramBotApi {
  constructor(
    private readonly botToken: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async sendMessage(input: TelegramSendMessageInput): Promise<TelegramSendMessageResult> {
    if (
      !input ||
      !Number.isSafeInteger(input.chatId) ||
      input.chatId <= 0 ||
      typeof input.text !== 'string' ||
      input.text.length === 0
    ) {
      throw new TelegramBotApiError('INVALID_REQUEST');
    }

    const body: Record<string, unknown> = {
      chat_id: input.chatId,
      text: boundedText(input.text),
    };
    if (input.disableWebPagePreview !== undefined) {
      body.disable_web_page_preview = input.disableWebPagePreview;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new TelegramBotApiError('NETWORK_ERROR');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new TelegramBotApiError(
          'RATE_LIMITED',
          response.status,
          getRetryAfterSeconds(payload, response),
        );
      }
      if (response.status >= 500) {
        throw new TelegramBotApiError('SERVER_ERROR', response.status);
      }
      if (response.status >= 400) {
        throw new TelegramBotApiError('CLIENT_ERROR', response.status);
      }
      throw new TelegramBotApiError('TELEGRAM_ERROR', response.status);
    }

    if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.result)) {
      throw new TelegramBotApiError('INVALID_RESPONSE', response.status);
    }

    const messageId = payload.result.message_id;
    if (typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId <= 0) {
      throw new TelegramBotApiError('INVALID_RESPONSE', response.status);
    }

    return { telegramMessageId: messageId };
  }
}

export function sendTelegramMessage(
  input: TelegramSendMessageInput,
): Promise<TelegramSendMessageResult>;
export function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: Pick<TelegramSendMessageInput, 'disableWebPagePreview'>,
): Promise<TelegramSendMessageResult>;
export function sendTelegramMessage(
  inputOrChatId: TelegramSendMessageInput | number,
  text?: string,
  options?: Pick<TelegramSendMessageInput, 'disableWebPagePreview'>,
): Promise<TelegramSendMessageResult> {
  const input =
    typeof inputOrChatId === 'number'
      ? { chatId: inputOrChatId, text: text ?? '', ...options }
      : inputOrChatId;
  return new TelegramBotApi(getTelegramConfig().botToken).sendMessage(input);
}

export function sendMessage(
  input: TelegramSendMessageInput,
): Promise<TelegramSendMessageResult>;
export function sendMessage(
  chatId: number,
  text: string,
  options?: Pick<TelegramSendMessageInput, 'disableWebPagePreview'>,
): Promise<TelegramSendMessageResult>;
export function sendMessage(
  inputOrChatId: TelegramSendMessageInput | number,
  text?: string,
  options?: Pick<TelegramSendMessageInput, 'disableWebPagePreview'>,
): Promise<TelegramSendMessageResult> {
  return typeof inputOrChatId === 'number'
    ? sendTelegramMessage(inputOrChatId, text ?? '', options)
    : sendTelegramMessage(inputOrChatId);
}
