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

  it('reads notification settings using the current authenticated profile', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'profile-2' } }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'profile-2', notifications: true, mentions_only: false, telegram_enabled: true },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    await expect(new SupabaseDataProvider().getUserSettings()).resolves.toMatchObject({
      user_id: 'profile-2',
      telegram_enabled: true,
    });
    expect(from).toHaveBeenCalledWith('user_settings');
    expect(eq).toHaveBeenCalledWith('user_id', 'profile-2');
  });

  it('persists notification settings through the authenticated Supabase provider', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'profile-2' } }, error: null });
    const currentMaybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: 'profile-2', notifications: true, mentions_only: false, telegram_enabled: false },
      error: null,
    });
    const currentEq = vi.fn().mockReturnValue({ maybeSingle: currentMaybeSingle });
    const currentSelect = vi.fn().mockReturnValue({ eq: currentEq });
    const single = vi.fn().mockResolvedValue({
      data: { user_id: 'profile-2', notifications: true, mentions_only: false, telegram_enabled: true },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    let settingsRead = false;
    from.mockImplementation(() => {
      if (!settingsRead) {
        settingsRead = true;
        return { select: currentSelect };
      }
      return { upsert };
    });

    await expect(new SupabaseDataProvider().updateUserSettings({ telegram_enabled: true })).resolves.toMatchObject({
      telegram_enabled: true,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'profile-2', telegram_enabled: true }),
      { onConflict: 'user_id' },
    );
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

  it('persists notification settings per current mock user', async () => {
    const provider = new MockDataProvider('u2');

    expect((await provider.getUserSettings()).telegram_enabled).toBe(false);
    await provider.updateUserSettings({ telegram_enabled: true });
    expect((await provider.getUserSettings()).telegram_enabled).toBe(true);

    provider.setCurrentUser('u1');
    expect((await provider.getUserSettings()).telegram_enabled).toBe(false);
  });
});
