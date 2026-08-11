'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '@/types';
import { UserService } from '@/services/user-service';
import { getAuthProvider } from '@/lib/auth';

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
    const auth = getAuthProvider();

    auth
      .getCurrentUserId()
      .then(async userId => {
        if (!userId) return;
        const profile = await UserService.getUserById(userId);
        if (profile && profile.status !== 'BLOCKED') {
          setUser(profile);
        }
      })
      .finally(() => setIsLoading(false));

    const unsubscribe = auth.onAuthStateChange(userId => {
      if (!userId) setUser(null);
    });
    return () => unsubscribe();
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

    const updated = await UserService.setUserStatus(profile.id, 'ONLINE');
    setUser(updated);
    return { success: true };
  };

  const logout = async () => {
    if (user) {
      await UserService.setUserStatus(user.id, 'OFFLINE');
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
