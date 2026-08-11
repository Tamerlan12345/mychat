import type { IDataProvider } from './data-provider';
import { globalDataProvider } from './mock-provider';
import { SupabaseDataProvider } from './supabase-provider';

export type ProviderMode = 'mock' | 'supabase';

export function resolveProviderMode(env: Record<string, string | undefined>): ProviderMode {
  const hasUrl = !!env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (hasUrl && hasKey) return 'supabase';
  if (!hasUrl && !hasKey) return 'mock';

  throw new Error(
    'Incomplete Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set together, or neither (to use the mock provider).'
  );
}

let cachedProvider: IDataProvider | null = null;

export function getDataProvider(): IDataProvider {
  if (!cachedProvider) {
    const mode = resolveProviderMode({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
    cachedProvider = mode === 'supabase' ? new SupabaseDataProvider() : globalDataProvider;
  }
  return cachedProvider;
}
