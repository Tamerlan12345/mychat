'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '@/types';
import { UserService } from '@/services/user-service';
import { getAuthProvider } from '@/lib/auth';
import { connectionManager } from '@/lib/desktop/connection-manager';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  setUserStatus: (status: UserStatus) => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  setUserStatus: async () => {},
  isAdmin: false,
  isSuperAdmin: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: () => void = () => {};

    const initAuth = async () => {
      try {
        await connectionManager.init();
      } catch (err) {
        console.error('Failed to initialize connection manager:', err);
      }

      const auth = getAuthProvider();

      try {
        const userId = await auth.getCurrentUserId();
        if (userId) {
          const profile = await UserService.getUserById(userId);
          if (profile && profile.status !== 'BLOCKED') {
            setUser(profile);
          }
        }
      } catch (err) {
        console.error('Failed to resolve initial user session:', err);
      } finally {
        setIsLoading(false);
      }

      unsubscribe = auth.onAuthStateChange(userId => {
        if (!userId) setUser(null);
      });
    };

    void initAuth();

    return () => {
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const auth = getAuthProvider();
    const result = await auth.signIn(email, password);
    if (!result.success || !result.userId) {
      return { success: false, error: result.error };
    }

    const profile = await UserService.getUserById(result.userId);
    if (!profile) {
      return { success: false, error: 'Профиль пользователя не найден.' };
    }
    if (profile.status === 'BLOCKED') {
      await auth.signOut();
      return { success: false, error: 'Ваш аккаунт заблокирован администратором.' };
    }

    const updated = await UserService.setUserStatus(profile.id, 'ONLINE');
    setUser(updated);
    return { success: true };
  };

  const logout = async () => {
    if (user) {
      try {
        await UserService.setUserStatus(user.id, 'OFFLINE');
      } catch {
        // Status update can fail (e.g. the user was BLOCKED by an admin mid-session,
        // which the on_profiles_update trigger's "cannot un-block yourself" guard
        // rejects) — don't let that stop sign-out from completing, or the user would
        // be stuck logged in with no way to clear their own session.
      }
    }
    await getAuthProvider().signOut();
    setUser(null);
  };

  const setUserStatus = async (status: UserStatus) => {
    if (!user) return;
    const updated = await UserService.setUserStatus(user.id, status);
    setUser(updated);
  };

  const isAdmin = user ? user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' : false;
  const isSuperAdmin = user ? user.role === 'SUPER_ADMIN' : false;

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, logout, setUserStatus, isAdmin, isSuperAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
