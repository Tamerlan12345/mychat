import 'server-only';

import {
  generateTelegramLinkToken,
  hashTelegramLinkToken,
} from './config';
import { getTelegramAuthClient, getTelegramServerClient } from './server-client';
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
  | 'AUTHENTICATION_ERROR'
  | 'INVALID_ARGUMENT';

export class TelegramRepositoryError extends Error {
  constructor(public readonly code: TelegramRepositoryErrorCode) {
    super('Telegram repository operation failed.');
    this.name = 'TelegramRepositoryError';
  }
}

export interface CreateTelegramLinkInput {
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

const TELEGRAM_USER_SCOPE_BRAND = Symbol('TelegramUserScope');

/**
 * Created after a server auth boundary has established the authenticated actor.
 * The owner is intentionally bound to that actor; user-scoped repository methods
 * never accept a caller-provided profile ID.
 */
export interface TelegramUserScope {
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly [TELEGRAM_USER_SCOPE_BRAND]: true;
}

export type TelegramClaimedIdentity = Pick<
  TelegramIdentity,
  'id' | 'profile_id' | 'telegram_user_id' | 'telegram_chat_id' | 'username' | 'status'
>;

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_OUTBOX_LIMIT = 10;
const MAX_OUTBOX_LIMIT = 100;
const DEFAULT_LEASE_SECONDS = 60;
const MAX_LEASE_SECONDS = 3_600;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
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
  if (isRecord(error) && error.code === 'AUTHENTICATION_ERROR') {
    return new TelegramRepositoryError('AUTHENTICATION_ERROR');
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

function requireText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TelegramRepositoryError('INVALID_ARGUMENT');
  }
}

function ownerProfileIdForScope(scope: TelegramUserScope): string {
  if (
    !isRecord(scope) ||
    scope[TELEGRAM_USER_SCOPE_BRAND] !== true ||
    typeof scope.actorUserId !== 'string' ||
    typeof scope.ownerUserId !== 'string' ||
    scope.actorUserId !== scope.ownerUserId
  ) {
    throw new TelegramRepositoryError('INVALID_ARGUMENT');
  }
  return scope.ownerUserId;
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

export async function createTelegramUserScope(
  accessToken: string,
): Promise<TelegramUserScope> {
  requireText(accessToken);

  try {
    const { data, error } = await getTelegramAuthClient().auth.getUser(accessToken);
    if (error || !data.user?.id) {
      throw new TelegramRepositoryError('AUTHENTICATION_ERROR');
    }

    return Object.freeze({
      actorUserId: data.user.id,
      ownerUserId: data.user.id,
      [TELEGRAM_USER_SCOPE_BRAND]: true as const,
    });
  } catch (error) {
    throw repositoryError(error);
  }
}

export async function createTelegramLink(
  scope: TelegramUserScope,
  input: CreateTelegramLinkInput = {},
): Promise<CreatedTelegramLink> {
  const ownerProfileId = ownerProfileIdForScope(scope);
  const rawToken = generateTelegramLinkToken();
  const expiresAt = toIso(input.expiresAt);

  return safely(async () => {
    const { error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.linkTokens)
      .insert({
        owner_profile_id: ownerProfileId,
        token_hash: hashTelegramLinkToken(rawToken),
        expires_at: expiresAt,
      });
    if (error) throw repositoryError(error);
    return { rawToken, expiresAt };
  });
}

export async function claimTelegramLink(
  input: ClaimTelegramLinkInput,
): Promise<TelegramClaimedIdentity | null> {
  return safely(async () => {
    const { data, error } = await getTelegramServerClient().rpc(TELEGRAM_RPCS.claimLink, {
      p_token_hash: input.tokenHash,
      p_telegram_user_id: input.telegramUserId,
      p_telegram_chat_id: input.telegramChatId,
      p_username: input.username ?? null,
    });
    if (error) throw repositoryError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (row == null) return null;
    if (
      !isRecord(row) ||
      typeof row.identity_id !== 'string' ||
      typeof row.profile_id !== 'string' ||
      typeof row.telegram_user_id !== 'number' ||
      typeof row.telegram_chat_id !== 'number' ||
      (row.username !== null && typeof row.username !== 'string') ||
      (row.status !== 'active' && row.status !== 'disconnected')
    ) {
      throw new TelegramRepositoryError('DATABASE_ERROR');
    }
    return {
      id: row.identity_id,
      profile_id: row.profile_id,
      telegram_user_id: row.telegram_user_id,
      telegram_chat_id: row.telegram_chat_id,
      username: row.username,
      status: row.status,
    };
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
  scope: TelegramUserScope,
): Promise<TelegramIdentity | null> {
  const ownerProfileId = ownerProfileIdForScope(scope);
  return safely(async () => {
    const { data, error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.identities)
      .select('*')
      .eq('profile_id', ownerProfileId)
      .maybeSingle();
    if (error) throw repositoryError(error);
    return data as TelegramIdentity | null;
  });
}

export async function getTelegramRelayLogs(
  scope: TelegramUserScope,
  limit = 50,
): Promise<TelegramRelayLog[]> {
  const ownerProfileId = ownerProfileIdForScope(scope);
  const boundedLimit = boundedInteger(limit, 50, 100);
  return safely(async () => {
    const { data, error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.relayLog)
      .select('*')
      .eq('profile_id', ownerProfileId)
      .order('created_at', { ascending: false })
      .limit(boundedLimit);
    if (error) throw repositoryError(error);
    return (data ?? []) as TelegramRelayLog[];
  });
}

export async function disconnectTelegramIdentity(scope: TelegramUserScope): Promise<void> {
  const ownerProfileId = ownerProfileIdForScope(scope);
  return safely(async () => {
    const { error } = await getTelegramServerClient()
      .from(TELEGRAM_TABLES.identities)
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', ownerProfileId)
      .eq('status', 'active');
    if (error) throw repositoryError(error);
  });
}
