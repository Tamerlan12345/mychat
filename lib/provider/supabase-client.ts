import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Key the client is created with in gateway mode; the gateway replaces it with the real anon key. */
export const GATEWAY_PLACEHOLDER_KEY = 'gateway';

let client: SupabaseClient | null = null;

/**
 * Two ways to reach data:
 *  - gateway mode: NEXT_PUBLIC_SERVER_URL points at the company gateway, which proxies Supabase and
 *    injects the keys — the client never holds them;
 *  - direct mode: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy / no gateway).
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (serverUrl) {
    client = createClient(serverUrl.replace(/\/+$/, ''), GATEWAY_PLACEHOLDER_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    return client;
  }

  if (!url || !anonKey) {
    throw new Error(
      'getSupabaseClient() called without NEXT_PUBLIC_SERVER_URL or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY set.'
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export function resetSupabaseClient(): void {
  client = null;
}
