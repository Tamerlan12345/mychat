// lib/auth/supabase-auth-provider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithPassword = vi.fn();
const signOut = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock('@/lib/provider/supabase-client', () => ({
  getSupabaseClient: () => ({
    auth: { signInWithPassword, signOut, getSession, onAuthStateChange },
  }),
}));

import { SupabaseAuthProvider, mapAuthError } from './supabase-auth-provider';

describe('mapAuthError', () => {
  it('translates the known "invalid credentials" message', () => {
    expect(mapAuthError('Invalid login credentials')).toBe('Неверный email или пароль.');
  });

  it('falls back to a generic message when none is given', () => {
    expect(mapAuthError(undefined)).toBe('Ошибка входа в систему.');
  });

  it('passes through unrecognized messages as-is', () => {
    expect(mapAuthError('Email not confirmed')).toBe('Email not confirmed');
  });
});

describe('SupabaseAuthProvider', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    signOut.mockReset();
    getSession.mockReset();
  });

  it('signIn returns success with the user id on a valid login', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: 'uuid-123' } }, error: null });
    const provider = new SupabaseAuthProvider();
    const result = await provider.signIn('a@b.com', 'secret');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' });
    expect(result).toEqual({ success: true, userId: 'uuid-123' });
  });

  it('signIn returns a mapped error on bad credentials', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });
    const provider = new SupabaseAuthProvider();
    const result = await provider.signIn('a@b.com', 'wrong');
    expect(result).toEqual({ success: false, error: 'Неверный email или пароль.' });
  });

  it('getCurrentUserId reads the session user id', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'uuid-456' } } } });
    const provider = new SupabaseAuthProvider();
    expect(await provider.getCurrentUserId()).toBe('uuid-456');
  });

  it('getCurrentUserId returns null with no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const provider = new SupabaseAuthProvider();
    expect(await provider.getCurrentUserId()).toBeNull();
  });
});
