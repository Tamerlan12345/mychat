import type { IAuthProvider } from './auth-provider';
import { MockAuthProvider } from './mock-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';
import { resolveProviderMode } from '@/lib/provider';

let cached: IAuthProvider | null = null;

export function getAuthProvider(): IAuthProvider {
  if (!cached) {
    const mode = resolveProviderMode(process.env as Record<string, string | undefined>);
    cached = mode === 'supabase' ? new SupabaseAuthProvider() : new MockAuthProvider();
  }
  return cached;
}
