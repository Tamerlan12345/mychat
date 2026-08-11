import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveProviderMode } from './index';

describe('resolveProviderMode', () => {
  it('returns "mock" when no Supabase env vars are set', () => {
    expect(resolveProviderMode({})).toBe('mock');
  });

  it('returns "supabase" when both env vars are set', () => {
    expect(
      resolveProviderMode({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toBe('supabase');
  });

  it('throws when only the URL is set', () => {
    expect(() =>
      resolveProviderMode({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })
    ).toThrow(/must be set together/);
  });

  it('throws when only the anon key is set', () => {
    expect(() => resolveProviderMode({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' })).toThrow(
      /must be set together/
    );
  });
});

describe('getDataProvider', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('returns the mock provider singleton when no env vars are set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getDataProvider } = await import('./index');
    const { globalDataProvider } = await import('./mock-provider');
    expect(getDataProvider()).toBe(globalDataProvider);
  });

  it('returns a SupabaseDataProvider instance when both env vars are set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { getDataProvider } = await import('./index');
    const { SupabaseDataProvider } = await import('./supabase-provider');
    expect(getDataProvider()).toBeInstanceOf(SupabaseDataProvider);
  });
});
