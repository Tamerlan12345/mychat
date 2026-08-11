import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const client = { rpc, from };
const authClient = { auth: { getUser } };

vi.mock('./server-client', () => ({
  getTelegramServerClient: () => client,
  getTelegramAuthClient: () => authClient,
}));

import {
  claimTelegramLink,
  completeOutbox,
  createTelegramLink,
  disconnectTelegramIdentity,
  failOutbox,
  getTelegramIdentity,
  getTelegramRelayLogs,
  ingestTelegramInbound,
  leaseOutbox,
  TelegramRepositoryError,
  createTelegramUserScope,
  type TelegramUserScope,
} from './repository';

describe('Telegram repository', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getUser.mockReset();
  });

  async function verifiedScope(userId = 'profile-1'): Promise<TelegramUserScope> {
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    return createTelegramUserScope('verified-access-token');
  }

  it('creates a scope only from the Supabase Auth verified subject', async () => {
    const scope = await verifiedScope();

    expect(scope.actorUserId).toBe('profile-1');
    expect(scope.ownerUserId).toBe('profile-1');
    expect(getUser).toHaveBeenCalledWith('verified-access-token');
  });

  it.each([undefined, ''])('rejects a missing access token before Auth lookup: %j', async (token) => {
    await expect(createTelegramUserScope(token as never)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid access token when Supabase Auth returns an error', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token=secret' },
    });

    await expect(createTelegramUserScope('invalid-access-token')).rejects.toMatchObject({
      code: 'AUTHENTICATION_ERROR',
      message: 'Telegram repository operation failed.',
    });
  });

  it('persists only the hash when creating a link token', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });
    const scope = await verifiedScope();

    const result = await createTelegramLink(scope, { expiresAt: '2026-08-11T12:00:00.000Z' });

    expect(from).toHaveBeenCalledWith('telegram_link_tokens');
    expect(insert).toHaveBeenCalledWith({
      owner_profile_id: 'profile-1',
      token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expires_at: '2026-08-11T12:00:00.000Z',
    });
    expect(insert.mock.calls[0][0].token_hash).not.toBe(result.rawToken);
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('calls claim RPC with the migration parameter names', async () => {
    rpc.mockResolvedValue({
      data: [{
        identity_id: 'identity-1', profile_id: 'profile-1', telegram_user_id: 7,
        telegram_chat_id: 8, username: 'relay', status: 'active',
      }],
      error: null,
    });

    await expect(claimTelegramLink({
      tokenHash: 'a'.repeat(64),
      telegramUserId: 7,
      telegramChatId: 8,
      username: 'relay',
    })).resolves.toMatchObject({ id: 'identity-1', profile_id: 'profile-1' });

    expect(rpc).toHaveBeenCalledWith('claim_telegram_link_token', {
      p_token_hash: 'a'.repeat(64),
      p_telegram_user_id: 7,
      p_telegram_chat_id: 8,
      p_username: 'relay',
    });
  });

  it('normalizes an empty claim RPC result to null', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(claimTelegramLink({
      tokenHash: 'a'.repeat(64), telegramUserId: 7, telegramChatId: 8,
    })).resolves.toBeNull();
  });

  it('calls inbound and outbox RPCs with exact migration shapes', async () => {
    rpc
      .mockResolvedValueOnce({ data: { id: 'message-1' }, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'outbox-1' }], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await ingestTelegramInbound({
      telegramUserId: 7, telegramChatId: 8, telegramMessageId: 9, content: 'hello',
    });
    await leaseOutbox({ limit: 4, leaseSeconds: 30 });
    await completeOutbox({ id: 'outbox-1', leaseToken: 'lease-1', telegramMessageId: 10 });
    await failOutbox({ id: 'outbox-1', leaseToken: 'lease-1', errorCode: 'RATE_LIMITED', retryAt: '2026-08-11T12:01:00.000Z' });

    expect(rpc).toHaveBeenNthCalledWith(1, 'ingest_telegram_inbound', {
      p_telegram_user_id: 7, p_telegram_chat_id: 8, p_telegram_message_id: 9, p_content: 'hello',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'lease_telegram_outbox', {
      p_limit: 4, p_lease_seconds: 30,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'complete_telegram_outbox', {
      p_id: 'outbox-1', p_lease_token: 'lease-1', p_telegram_message_id: 10,
    });
    expect(rpc).toHaveBeenNthCalledWith(4, 'fail_telegram_outbox', {
      p_id: 'outbox-1', p_lease_token: 'lease-1', p_error_code: 'RATE_LIMITED',
      p_retry_at: '2026-08-11T12:01:00.000Z',
    });
  });

  it('reads identity and relay logs and disconnects only the requested profile', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'identity-1' }, error: null });
    const identityEq = vi.fn().mockReturnValue({ maybeSingle });
    const identitySelect = vi.fn().mockReturnValue({ eq: identityEq });
    const logLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const logOrder = vi.fn().mockReturnValue({ limit: logLimit });
    const logEq = vi.fn().mockReturnValue({ order: logOrder });
    const logSelect = vi.fn().mockReturnValue({ eq: logEq });
    const finalEq = vi.fn().mockResolvedValue({ error: null });
    const statusEq = vi.fn().mockReturnValue({ eq: finalEq });
    const profileEq = vi.fn().mockReturnValue({ eq: statusEq });
    const update = vi.fn().mockReturnValue({ eq: profileEq });
    const scope = await verifiedScope();
    from
      .mockReturnValueOnce({ select: identitySelect })
      .mockReturnValueOnce({ select: logSelect })
      .mockReturnValueOnce({ update });

    await getTelegramIdentity(scope);
    await getTelegramRelayLogs(scope);
    await disconnectTelegramIdentity(scope);

    expect(from).toHaveBeenNthCalledWith(1, 'telegram_identities');
    expect(identityEq).toHaveBeenCalledWith('profile_id', 'profile-1');
    expect(from).toHaveBeenNthCalledWith(2, 'telegram_relay_log');
    expect(logEq).toHaveBeenCalledWith('profile_id', 'profile-1');
    expect(logLimit).toHaveBeenCalledWith(50);
    expect(from).toHaveBeenNthCalledWith(3, 'telegram_identities');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'disconnected' }));
    expect(profileEq).toHaveBeenCalledWith('profile_id', 'profile-1');
    expect(statusEq).toHaveBeenCalledWith('status', 'active');
  });

  it('rejects a cross-profile scope before service-role access', async () => {
    const ownerScope = await verifiedScope();
    const crossProfileScope = {
      ...ownerScope,
      ownerUserId: 'profile-2',
    } as TelegramUserScope;

    await expect(getTelegramIdentity(crossProfileScope)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(getTelegramRelayLogs(crossProfileScope)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    await expect(disconnectTelegramIdentity(crossProfileScope)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('maps Supabase failures to safe internal codes', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate Telegram ID 987654321 and token=secret' },
    });

    const error = await claimTelegramLink({
      tokenHash: 'a'.repeat(64), telegramUserId: 7, telegramChatId: 8,
    }).catch((value) => value);

    expect(error).toBeInstanceOf(TelegramRepositoryError);
    expect(error.code).toBe('CONFLICT');
    expect(error.message).toBe('Telegram repository operation failed.');
    expect(error.message).not.toContain('987654321');
    expect(error.message).not.toContain('secret');
  });
});
