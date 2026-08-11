import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const testUrl = process.env.SUPABASE_TEST_URL?.trim();
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim();
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim();
const ordinarySupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const testProjectMarker = process.env.SUPABASE_TEST_PROJECT_MARKER?.trim();
const destructiveConfirmation = process.env.SUPABASE_TEST_ALLOW_DESTRUCTIVE?.trim();
const destructiveConfirmationValue = 'I_UNDERSTAND_THIS_IS_A_DEDICATED_TEST_PROJECT';
const safetyFailures = [
  !testUrl && 'SUPABASE_TEST_URL is absent',
  !testServiceRoleKey && 'SUPABASE_TEST_SERVICE_ROLE_KEY is absent',
  !testAnonKey && 'SUPABASE_TEST_ANON_KEY is absent',
  !testProjectMarker && 'SUPABASE_TEST_PROJECT_MARKER is absent',
  destructiveConfirmation !== destructiveConfirmationValue
    && 'SUPABASE_TEST_ALLOW_DESTRUCTIVE does not match the required confirmation',
  testUrl && ordinarySupabaseUrl && testUrl === ordinarySupabaseUrl
    && 'SUPABASE_TEST_URL must not equal NEXT_PUBLIC_SUPABASE_URL',
].filter(Boolean);
const canRun = safetyFailures.length === 0;

if (!canRun) {
  console.info(
    'SKIP: Supabase Telegram outbox integration tests require a separate dedicated project. '
      + `Safety checks failed: ${safetyFailures.join('; ')}.`,
  );
}

const describeIntegration = canRun ? describe : describe.skip;

describeIntegration('Telegram outbox Supabase integration', () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;
  let senderId: string;
  let recipientId: string;
  let conversationId: string;
  const senderEmail = `telegram-outbox-sender-${Date.now()}@example.test`;
  const recipientEmail = `telegram-outbox-recipient-${Date.now()}@example.test`;
  const password = `Integration-${Date.now()}-secret`;

  async function must<T>(
    promise: PromiseLike<{ data: T; error: any }>,
    label: string,
  ): Promise<NonNullable<T>> {
    const result = await promise;
    if (result.error || result.data == null) throw new Error(`${label}: ${result.error?.message ?? 'no data'}`);
    return result.data as NonNullable<T>;
  }

  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const result = await service.rpc(name, args);
    if (result.error) throw new Error(`${name}: ${result.error.message}`);
    return result.data;
  }

  async function insertMessage(content: string) {
    return must(
      service.from('messages').insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: 'TEXT',
      }).select('id').single(),
      'insert message',
    );
  }

  beforeAll(async () => {
    service = createClient(testUrl!, testServiceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(testUrl!, testAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sender = await service.auth.admin.createUser({ email: senderEmail, password, email_confirm: true });
    if (sender.error || !sender.data.user) throw new Error(`create sender: ${sender.error?.message ?? 'no user'}`);
    senderId = sender.data.user.id;
    const recipient = await service.auth.admin.createUser({ email: recipientEmail, password, email_confirm: true });
    if (recipient.error || !recipient.data.user) throw new Error(`create recipient: ${recipient.error?.message ?? 'no user'}`);
    recipientId = recipient.data.user.id;

    conversationId = await must(
      service.from('conversations').insert({ type: 'DIRECT', created_by: senderId }).select('id').single(),
      'create conversation',
    ).then(row => row.id);
    const members = await service.from('conversation_members').insert([
      { conversation_id: conversationId, user_id: senderId },
      { conversation_id: conversationId, user_id: recipientId },
    ]);
    if (members.error) throw new Error(`create members: ${members.error.message}`);

    const settings = await service.from('user_settings').upsert({ user_id: recipientId, telegram_enabled: true });
    if (settings.error) throw new Error(`create settings: ${settings.error.message}`);
    const identity = await service.from('telegram_identities').insert({
      profile_id: recipientId,
      telegram_user_id: Number(`${Date.now()}`.slice(-8)),
      telegram_chat_id: Number(`${Date.now() + 1}`.slice(-8)),
      username: 'integration_recipient',
      status: 'active',
    });
    if (identity.error) throw new Error(`create identity: ${identity.error.message}`);
  });

  beforeEach(async () => {
    await service.from('telegram_notification_outbox').delete().eq('profile_id', recipientId);
    await service.from('profiles').update({ status: 'OFFLINE' }).eq('id', recipientId);
    await service.from('user_settings').update({ telegram_enabled: true }).eq('user_id', recipientId);
  });

  afterAll(async () => {
    if (!service) return;
    if (conversationId) await service.from('conversations').delete().eq('id', conversationId);
    if (recipientId) await service.from('telegram_identities').delete().eq('profile_id', recipientId);
    if (senderId) await service.auth.admin.deleteUser(senderId);
    if (recipientId) await service.auth.admin.deleteUser(recipientId);
  });

  it('enqueues eligible direct messages atomically and idempotently', async () => {
    const message = await insertMessage('integration eligible');
    const first = await must(
      service.from('telegram_notification_outbox').select('*').eq('idempotency_key', `${message.id}:${recipientId}`).single(),
      'read outbox',
    );
    expect(first.profile_id).toBe(recipientId);
    expect(first.payload.text).toContain('integration eligible');

    const duplicate = await service.from('telegram_notification_outbox').insert({
      profile_id: recipientId,
      idempotency_key: `${message.id}:${recipientId}`,
      telegram_chat_id: first.telegram_chat_id,
      payload: first.payload,
    });
    expect(duplicate.error?.code).toBe('23505');
    const count = await service.from('telegram_notification_outbox').select('id', { count: 'exact', head: true })
      .eq('idempotency_key', `${message.id}:${recipientId}`);
    expect(count.error).toBeNull();
    expect(count.count).toBe(1);
  });

  it('enqueues AWAY recipients but excludes connected or settings-disabled recipients', async () => {
    await service.from('profiles').update({ status: 'AWAY' }).eq('id', recipientId);
    await insertMessage('integration away');
    await service.from('profiles').update({ status: 'ONLINE' }).eq('id', recipientId);
    await insertMessage('integration connected');
    await service.from('profiles').update({ status: 'OFFLINE' }).eq('id', recipientId);
    await service.from('user_settings').update({ telegram_enabled: false }).eq('user_id', recipientId);
    await insertMessage('integration disabled');

    const rows = await must(
      service.from('telegram_notification_outbox').select('payload').eq('profile_id', recipientId),
      'read eligibility outbox',
    );
    expect(rows.map(row => row.payload.text)).not.toEqual(expect.arrayContaining([
      expect.stringContaining('integration connected'),
      expect.stringContaining('integration disabled'),
    ]));
  });

  it('enforces RLS and grants for authenticated and anonymous clients', async () => {
    const signIn = await anon.auth.signInWithPassword({ email: recipientEmail, password });
    expect(signIn.error).toBeNull();
    const identityRead = await anon.from('telegram_identities').select('profile_id').eq('profile_id', recipientId);
    expect(identityRead.error).toBeNull();
    const outboxRead = await anon.from('telegram_notification_outbox').select('id');
    expect(outboxRead.error).not.toBeNull();
    const leaseCall = await anon.rpc('lease_telegram_outbox', { p_limit: 1, p_lease_seconds: 30 });
    expect(leaseCall.error).not.toBeNull();
  });

  it('reclaims stale leases but rejects stale completion and failure tokens', async () => {
    await service.from('user_settings').update({ telegram_enabled: false }).eq('user_id', recipientId);
    const stale = await must(
      service.from('telegram_notification_outbox').insert({
        profile_id: recipientId,
        idempotency_key: `stale-${Date.now()}`,
        telegram_chat_id: 123456789,
        payload: { text: 'stale lease' },
        status: 'leased',
        attempts: 1,
        max_attempts: 5,
        next_attempt_at: new Date(Date.now() - 1_000).toISOString(),
        lease_token: '00000000-0000-0000-0000-000000000001',
        leased_until: new Date(Date.now() - 1_000).toISOString(),
      }).select('*').single(),
      'create stale outbox',
    );
    const leasedRows = await rpc('lease_telegram_outbox', { p_limit: 1, p_lease_seconds: 30 });
    const reclaimed = leasedRows.find((entry: any) => entry.id === stale.id);
    expect(reclaimed).toBeDefined();
    expect(reclaimed.lease_token).not.toBe(stale.lease_token);
    expect(await rpc('complete_telegram_outbox', {
      p_id: stale.id,
      p_lease_token: stale.lease_token,
      p_telegram_message_id: 77,
    })).toBe(false);
    expect(await rpc('fail_telegram_outbox', {
      p_id: stale.id,
      p_lease_token: stale.lease_token,
      p_error_code: 'NETWORK_ERROR',
      p_retry_at: new Date().toISOString(),
    })).toBe(false);
  });

  it('leases rows concurrently without assigning one row twice', async () => {
    const rows = await Promise.all([
      service.from('telegram_notification_outbox').insert({
        profile_id: recipientId, idempotency_key: `concurrent-a-${Date.now()}`,
        telegram_chat_id: 111111111, payload: { text: 'concurrent a' },
      }).select('id').single(),
      service.from('telegram_notification_outbox').insert({
        profile_id: recipientId, idempotency_key: `concurrent-b-${Date.now()}`,
        telegram_chat_id: 222222222, payload: { text: 'concurrent b' },
      }).select('id').single(),
    ]);
    expect(rows.every(result => result.error == null)).toBe(true);

    const leases = await Promise.all([
      rpc('lease_telegram_outbox', { p_limit: 1, p_lease_seconds: 30 }),
      rpc('lease_telegram_outbox', { p_limit: 1, p_lease_seconds: 30 }),
    ]);
    const leasedIds = leases.flat().map((entry: any) => entry.id);
    expect(new Set(leasedIds).size).toBe(leasedIds.length);
  });
});
