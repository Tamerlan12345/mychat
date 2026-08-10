'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserStatus } from '@/types';
import { UserService } from '@/services/user-service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
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
    // Restore session from localStorage or load default demo admin
    const storedUserId = typeof window !== 'undefined' ? localStorage.getItem('corporate_chat_user_id') : null;
    const initialUserId = storedUserId || 'u1'; // default to admin demo

    UserService.getUserById(initialUserId).then(u => {
      if (u && u.status !== 'BLOCKED') {
        setUser(u);
      } else {
        localStorage.removeItem('corporate_chat_user_id');
      }
      setIsLoading(false);
    }).catch(() => {
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const users = await UserService.getUsers();
    const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!foundUser) {
      return { success: false, error: 'Пользователь с таким email не найден.' };
    }

    if (foundUser.status === 'BLOCKED') {
      return { success: false, error: 'Ваш аккаунт заблокирован администратором.' };
    }

    // Set online status on login
    const updatedUser = await UserService.setUserStatus(foundUser.id, 'ONLINE');
    setUser(updatedUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem('corporate_chat_user_id', updatedUser.id);
    }
    return { success: true };
  };

  const logout = () => {
    if (user) {
      UserService.setUserStatus(user.id, 'OFFLINE');
    }
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('corporate_chat_user_id');
    }
  };

  const setUserStatus = async (status: UserStatus) => {
    if (!user) return;
    const updated = await UserService.setUserStatus(user.id, status);
    setUser(updated);
  };

  const isAdmin = user ? (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') : false;
  const isSuperAdmin = user ? user.role === 'SUPER_ADMIN' : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        setUserStatus,
        isAdmin,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
