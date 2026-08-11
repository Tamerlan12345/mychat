import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  it('reads only the two literal NEXT_PUBLIC_* member expressions from process.env (required for Next.js client-bundle inlining), never the whole env object', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf-8');
    expect(source).not.toMatch(/resolveProviderMode\(\s*process\.env\s*[,)]/);
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_URL:\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    expect(source).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY:\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
