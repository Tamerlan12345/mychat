import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const getUser = vi.fn();
const getSession = vi.fn();
const client = { from, auth: { getUser, getSession } };

vi.mock('./supabase-client', () => ({ getSupabaseClient: () => client }));

import { MockDataProvider } from './mock-provider';
import { SupabaseDataProvider } from './supabase-provider';

beforeEach(() => {
  from.mockReset();
  getUser.mockReset();
  getSession.mockReset();
  vi.unstubAllGlobals();
});

describe('Supabase Telegram provider boundaries', () => {
  it('forwards the verified session access token to the link route', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deepLink: 'https://t.me/relay_bot?start=token', expiresAt: '2026-08-11T12:00:00.000Z' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new SupabaseDataProvider().createTelegramLink()).resolves.toMatchObject({
      deepLink: 'https://t.me/relay_bot?start=token',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/telegram/account', {
      method: 'POST',
      headers: { Authorization: 'Bearer session-token' },
    });
  });

  it('fails safely when link creation has no authenticated session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(new SupabaseDataProvider().createTelegramLink()).rejects.toThrow('authentication required');
  });

  it('reads identity using the current authenticated profile, not a caller profile ID', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'profile-2' } }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { profile_id: 'profile-2', status: 'active' }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    await new SupabaseDataProvider().getTelegramIdentity();

    expect(from).toHaveBeenCalledWith('telegram_identities');
    expect(eq).toHaveBeenCalledWith('profile_id', 'profile-2');
  });

  it('routes disconnect through the authenticated account API boundary', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new SupabaseDataProvider().disconnectTelegram()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('/api/telegram/account', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer session-token' },
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('reads relay logs using the current authenticated profile and bounds the limit', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'profile-2' } }, error: null });
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    await new SupabaseDataProvider().getTelegramRelayLogs(500);

    expect(eq).toHaveBeenCalledWith('profile_id', 'profile-2');
    expect(limit).toHaveBeenCalledWith(100);
  });
});

describe('Mock Telegram provider boundaries', () => {
  it('tracks deterministic one-time tokens and isolates current-user ownership', async () => {
    const provider = new MockDataProvider();
    const firstLink = await provider.createTelegramLink();
    const firstToken = new URL(firstLink.deepLink).searchParams.get('start');

    provider.setCurrentUser('u2');
    expect(firstToken).toBe('mock-link-0001');
    expect(provider.consumeMockTelegramLink(firstToken!)).toBe(false);

    provider.setCurrentUser('u1');
    expect(provider.consumeMockTelegramLink(firstToken!)).toBe(true);
    expect(provider.consumeMockTelegramLink(firstToken!)).toBe(false);
    expect((await provider.getTelegramIdentity())?.profile_id).toBe('u1');
  });

  it('keeps disconnect and identity status scoped to the current mock user', async () => {
    const provider = new MockDataProvider('u2');

    expect(await provider.getTelegramIdentity()).toBeNull();
    await provider.disconnectTelegram();
    provider.setCurrentUser('u1');
    expect((await provider.getTelegramIdentity())?.status).toBe('active');
  });
});
