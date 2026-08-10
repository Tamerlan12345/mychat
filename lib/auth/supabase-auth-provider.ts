import { IAuthProvider, AuthResult } from './auth-provider';
import { getSupabaseClient } from '@/lib/provider/supabase-client';

export function mapAuthError(message?: string): string {
  if (!message) return 'Ошибка входа в систему.';
  if (message.includes('Invalid login credentials')) return 'Неверный email или пароль.';
  return message;
}

export class SupabaseAuthProvider implements IAuthProvider {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { success: false, error: mapAuthError(error?.message) };
    }
    return { success: true, userId: data.user.id };
  }

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  }

  async getCurrentUserId(): Promise<string | null> {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  }

  onAuthStateChange(callback: (userId: string | null) => void): () => void {
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      callback(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }
}
