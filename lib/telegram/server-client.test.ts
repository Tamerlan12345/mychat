import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('Telegram server clients', () => {
  beforeEach(() => {
    createClient.mockReset();
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('creates the access-token verifier with the anon key and no session persistence', async () => {
    const auth = { getUser: vi.fn() };
    createClient.mockReturnValue({ auth });
    const { getTelegramAuthClient } = await import('./server-client');

    expect(getTelegramAuthClient()).toEqual({ auth });
    expect(createClient).toHaveBeenCalledWith(
      'https://supabase.example.com',
      'anon-key',
      expect.objectContaining({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
    );
  });
});
