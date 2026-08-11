import {
  generateTelegramLinkToken,
  hashTelegramLinkToken,
} from './config';
import { getTelegramServerClient } from './server-client';
import type {
  Message,
  TelegramIdentity,
  TelegramNotificationOutbox,
  TelegramRelayLog,
} from '@/types';

if (typeof window !== 'undefined') {
  throw new Error('Telegram repository is server-only');
}

export const TELEGRAM_TABLES = Object.freeze({
  linkTokens: 'telegram_link_tokens',
  identities: 'telegram_identities',
  relayLog: 'telegram_relay_log',
  outbox: 'telegram_notification_outbox',
});

export const TELEGRAM_RPCS = Object.freeze({
  claimLink: 'claim_telegram_link_token',
  ingestInbound: 'ingest_telegram_inbound',
  leaseOutbox: 'lease_telegram_outbox',
  completeOutbox: 'complete_telegram_outbox',
  failOutbox: 'fail_telegram_outbox',
});

export type TelegramRepositoryErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'DATABASE_ERROR'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'IDENTITY_NOT_LINKED'
  | 'NO_DIRECT_CONVERSATION'
  | 'INVALID_ARGUMENT';

export class TelegramRepositoryError extends Error {
  constructor(public readonly code: TelegramRepositoryErrorCode) {
    super('Telegram repository operation failed.');
    this.name = 'TelegramRepositoryError';
  }
}

export interface CreateTelegramLinkInput {
  ownerProfileId: string;
  expiresAt?: Date | string;
}

export interface CreatedTelegramLink {
  rawToken: string;
  expiresAt: string;
}

export interface ClaimTelegramLinkInput {
  tokenHash: string;
  telegramUserId: number;
  telegramChatId: number;
  username?: string | null;
}

export interface IngestTelegramInboundInput {
  telegramUserId: number;
  telegramChatId: number;
  telegramMessageId: number;
  content: string;
}

export interface LeaseOutboxInput {
  limit?: number;
  leaseSeconds?: number;
}

export interface CompleteOutboxInput {
  id: string;
  leaseToken: string;
  telegramMessageId?: number | null;
}

export interface FailOutboxInput {
  id: string;
  leaseToken: string;
  errorCode: string;
  retryAt?: Date | string | null;
}

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_OUTBOX_LIMIT = 10;
const MAX_OUTBOX_LIMIT = 100;
const DEFAULT_LEASE_SECONDS = 60;
const MAX_LEASE_SECONDS = 3_600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function providerErrorCode(error: unknown): TelegramRepositoryErrorCode {
  if (!isRecord(error)) return 'DATABASE_ERROR';
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';

  if (code === '23505' || /already linked|duplicate|unique/i.test(message)) return 'CONFLICT';
  if (code === 'PGRST116') return 'NOT_FOUND';
  if (/identity is not linked/i.test(message)) return 'IDENTITY_NOT_LINKED';
  if (/no active direct conversation/i.test(message)) return 'NO_DIRECT_CONVERSATION';
  return 'DATABASE_ERROR';
}

function repositoryError(error: unknown): TelegramRepositoryError {
  if (error instanceof TelegramRepositoryError) return error;
  if (isRecord(error) && error.code === 'CONFIGURATION_ERROR') {
    return new TelegramRepositoryError('CONFIGURATION_ERROR');
  }
  return new TelegramRepositoryError(providerErrorCode(error));
}

async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw repositoryError(error);
  }
}

function requireText(value: string): void {
  if (!value.trim()) throw new TelegramRepositoryError('INVALID_ARGUMENT');
}

function toIso(value: Date | string | undefined): string {
  const date = value === undefined ? new Date(Date.now() + LINK_TOKEN_TTL_MS) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TelegramRepositoryError('INVALID_ARGUMENT');
  return date.toISOString();
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) throw new TelegramRepositoryError('INVALID_ARGUMENT');
  return Math.min(Math.max(Math.floor(candidate), 1), maximum);
}

export async function createTelegramLink(
  input: CreateTelegramLinkInput,
): Promise<CreatedTelegramLink> {
  requireText(input.ownerProfileId);
  const rawToken = generateTelegramLinkToken();
  const expiresAt = toIso(input.expiresAt);

  return safely(async () => {
    const { error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.linkTokens)
      .insert({
        owner_profile_id: input.ownerProfileId,
        token_hash: hashTelegramLinkToken(rawToken),
        expires_at: expiresAt,
      });
    if (error) throw repositoryError(error);
    return { rawToken, expiresAt };
  });
}

export async function claimTelegramLink(
  input: ClaimTelegramLinkInput,
): Promise<TelegramIdentity | null> {
  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.claimLink, {
      p_token_hash: input.tokenHash,
      p_telegram_user_id: input.telegramUserId,
      p_telegram_chat_id: input.telegramChatId,
      p_username: input.username ?? null,
    });
    if (error) throw repositoryError(error);
    if (!data) return null;
    return (Array.isArray(data) ? data[0] : data) as TelegramIdentity | null;
  });
}

export async function ingestTelegramInbound(
  input: IngestTelegramInboundInput,
): Promise<Message> {
  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.ingestInbound, {
      p_telegram_user_id: input.telegramUserId,
      p_telegram_chat_id: input.telegramChatId,
      p_telegram_message_id: input.telegramMessageId,
      p_content: input.content,
    });
    if (error) throw repositoryError(error);
    return data as Message;
  });
}

export async function leaseOutbox(
  input: LeaseOutboxInput = {},
): Promise<TelegramNotificationOutbox[]> {
  const limit = boundedInteger(input.limit, DEFAULT_OUTBOX_LIMIT, MAX_OUTBOX_LIMIT);
  const leaseSeconds = boundedInteger(input.leaseSeconds, DEFAULT_LEASE_SECONDS, MAX_LEASE_SECONDS);

  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.leaseOutbox, {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw repositoryError(error);
    return (Array.isArray(data) ? data : data ? [data] : []) as TelegramNotificationOutbox[];
  });
}

export async function completeOutbox(input: CompleteOutboxInput): Promise<boolean> {
  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.completeOutbox, {
      p_id: input.id,
      p_lease_token: input.leaseToken,
      p_telegram_message_id: input.telegramMessageId ?? null,
    });
    if (error) throw repositoryError(error);
    return data === true;
  });
}

export async function failOutbox(input: FailOutboxInput): Promise<boolean> {
  if (!/^[A-Za-z0-9:_-]{1,64}$/.test(input.errorCode)) {
    throw new TelegramRepositoryError('INVALID_ARGUMENT');
  }
  const retryAt = input.retryAt == null ? null : toIso(input.retryAt);

  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.failOutbox, {
      p_id: input.id,
      p_lease_token: input.leaseToken,
      p_error_code: input.errorCode,
      p_retry_at: retryAt,
    });
    if (error) throw repositoryError(error);
    return data === true;
  });
}

export async function getTelegramIdentity(
  profileId: string,
): Promise<TelegramIdentity | null> {
  return safely(async () => {
    const { data, error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.identities)
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw repositoryError(error);
    return data as TelegramIdentity | null;
  });
}

export async function getTelegramRelayLogs(
  profileId: string,
  limit = 50,
): Promise<TelegramRelayLog[]> {
  const boundedLimit = boundedInteger(limit, 50, 100);
  return safely(async () => {
    const { data, error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.relayLog)
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(boundedLimit);
    if (error) throw repositoryError(error);
    return (data ?? []) as TelegramRelayLog[];
  });
}

export async function disconnectTelegramIdentity(profileId: string): Promise<void> {
  return safely(async () => {
    const { error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.identities)
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      .eq('status', 'active');
    if (error) throw repositoryError(error);
  });
}
