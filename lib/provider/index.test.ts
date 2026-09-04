import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
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

  it('invalidates cached provider when resetDataProvider is called', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getDataProvider, resetDataProvider } = await import('./index');
    const { globalDataProvider } = await import('./mock-provider');
    const { SupabaseDataProvider } = await import('./supabase-provider');

    expect(getDataProvider()).toBe(globalDataProvider);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    expect(getDataProvider()).toBe(globalDataProvider);

    resetDataProvider();
    expect(getDataProvider()).toBeInstanceOf(SupabaseDataProvider);
  });

  it('reads only the two literal NEXT_PUBLIC_* member expressions from process.env (required for Next.js client-bundle inlining), never the whole env object', () => {
    // Next.js only statically inlines literal `process.env.NEXT_PUBLIC_X` member
    // expressions in client bundles. Passing `process.env` as a whole object bypasses
    // that inlining and silently breaks Supabase-mode detection in the browser. This
    // is a static-source check because the inlining behavior itself is a build-time
    // webpack transform that vitest does not perform.
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf-8');
    expect(source).not.toMatch(/resolveProviderMode\(\s*process\.env\s*[,)]/);
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_URL:\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY:\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
