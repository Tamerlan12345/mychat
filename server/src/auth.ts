import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuthedUser {
  id: string;
  email?: string;
  role: string;
}

export function bearerToken(req: Request): string | null {
  const value = req.headers.get('authorization');
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** Resolves the caller from their Supabase access token; null when absent or invalid. */
export async function verifyUser(admin: SupabaseClient, token: string | null): Promise<AuthedUser | null> {
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? undefined, role: (profile as any)?.role ?? 'EMPLOYEE' };
}

export const isAdminRole = (role: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';

/** Constant-time comparison for shared secrets (bot token, worker secret). */
export function secretMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
