import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error('Telegram server client is server-only');
}

export type TelegramServerClientErrorCode = 'CONFIGURATION_ERROR' | 'AUTHENTICATION_ERROR';

export class TelegramServerClientError extends Error {
  constructor(public readonly code: TelegramServerClientErrorCode) {
    super(
      code === 'AUTHENTICATION_ERROR'
        ? 'Telegram authentication failed.'
        : 'Telegram server client is not configured.',
    );
    this.name = 'TelegramServerClientError';
  }
}

let client: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

function sessionlessClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getTelegramServerClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new TelegramServerClientError('CONFIGURATION_ERROR');
  }

  client = sessionlessClient(url, serviceRoleKey);
  return client;
}

export function getTelegramAuthClient(): SupabaseClient {
  if (authClient) return authClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new TelegramServerClientError('CONFIGURATION_ERROR');
  }

  authClient = sessionlessClient(url, anonKey);
  return authClient;
}
