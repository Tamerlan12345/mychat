import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getAuthProvider', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('returns a MockAuthProvider when no Supabase env vars are set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getAuthProvider } = await import('./index');
    const { MockAuthProvider } = await import('./mock-auth-provider');
    expect(getAuthProvider()).toBeInstanceOf(MockAuthProvider);
  });

  it('returns a SupabaseAuthProvider when both env vars are set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { getAuthProvider } = await import('./index');
    const { SupabaseAuthProvider } = await import('./supabase-auth-provider');
    expect(getAuthProvider()).toBeInstanceOf(SupabaseAuthProvider);
  });
});
