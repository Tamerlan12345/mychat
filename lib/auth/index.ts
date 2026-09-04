import type { IAuthProvider } from './auth-provider';
import { MockAuthProvider } from './mock-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';
import { resolveProviderMode } from '@/lib/provider';

let cached: IAuthProvider | null = null;

export function getAuthProvider(): IAuthProvider {
  if (!cached) {
    const mode = resolveProviderMode({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    cached = mode === 'supabase' ? new SupabaseAuthProvider() : new MockAuthProvider();
  }
  return cached;
}

export function resetAuthProvider(): void {
  cached = null;
}
