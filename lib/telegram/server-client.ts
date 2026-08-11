import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error('Telegram server client is server-only');
}

export type TelegramServerClientErrorCode = 'CONFIGURATION_ERROR';

export class TelegramServerClientError extends Error {
  readonly code: TelegramServerClientErrorCode = 'CONFIGURATION_ERROR';

  constructor() {
    super('Telegram server client is not configured.');
    this.name = 'TelegramServerClientError';
  }
}

let client: SupabaseClient | null = null;

export function getTelegramServerClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new TelegramServerClientError();
  }

  client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}
