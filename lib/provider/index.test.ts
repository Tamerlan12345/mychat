import { describe, it, expect } from 'vitest';
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
