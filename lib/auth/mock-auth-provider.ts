import { IAuthProvider, AuthResult } from './auth-provider';
import { globalDataProvider } from '@/lib/provider/mock-provider';

const STORAGE_KEY = 'corporate_chat_user_id';

export class MockAuthProvider implements IAuthProvider {
  async signIn(email: string, _password: string): Promise<AuthResult> {
    const users = await globalDataProvider.getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      return { success: false, error: 'Пользователь с таким email не найден.' };
    }
    if (found.status === 'BLOCKED') {
      return { success: false, error: 'Ваш аккаунт заблокирован администратором.' };
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, found.id);
    }
    return { success: true, userId: found.id };
  }

  async signOut(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async getCurrentUserId(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  }

  onAuthStateChange(_callback: (userId: string | null) => void): () => void {
    // The mock provider has no external session-change events (no other tab/device
    // logs you out); nothing to subscribe to. Real Supabase Auth does — see
    // SupabaseAuthProvider in Task 5.
    return () => {};
  }
}
