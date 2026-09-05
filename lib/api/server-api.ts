import { getSupabaseClient } from '@/lib/provider/supabase-client';

/**
 * Base URL of the company gateway's own API (/api/v1/…). Empty when the app talks to Supabase
 * directly or runs on the in-memory provider — those modes have no gateway to call.
 */
export function getServerApiBase(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  return url ? url.replace(/\/+$/, '') : '';
}

export function hasGateway(): boolean {
  return getServerApiBase().length > 0;
}

/** Authenticated fetch against the gateway with the current user's access token. */
export async function serverApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getServerApiBase();
  if (!base) throw new Error('Шлюз не настроен: приложение подключено напрямую к базе данных.');
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${base}${path}`, { ...init, headers });
}
