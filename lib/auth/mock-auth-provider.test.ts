// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockAuthProvider } from './mock-auth-provider';
import { globalDataProvider } from '@/lib/provider/mock-provider';

describe('MockAuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    globalDataProvider.setCurrentUser('u1');
  });

  it('signs in a known, non-blocked user regardless of password', async () => {
    const provider = new MockAuthProvider();
    const result = await provider.signIn('admin@demo.local', 'wrong-password-doesnt-matter');
    expect(result.success).toBe(true);
    expect(result.userId).toBe('u1');
    expect(localStorage.getItem('corporate_chat_user_id')).toBe('u1');
  });

  it('rejects an unknown email', async () => {
    const provider = new MockAuthProvider();
    const result = await provider.signIn('nobody@demo.local', 'x');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/не найден/);
  });

  it('rejects a blocked user', async () => {
    await globalDataProvider.updateUser('u1', { status: 'BLOCKED' });
    const provider = new MockAuthProvider();
    const result = await provider.signIn('admin@demo.local', 'x');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/заблокирован/);
    await globalDataProvider.updateUser('u1', { status: 'ONLINE' }); // restore for other tests
  });

  it('getCurrentUserId reads back what signIn stored', async () => {
    const provider = new MockAuthProvider();
    await provider.signIn('admin@demo.local', 'x');
    expect(await provider.getCurrentUserId()).toBe('u1');
  });

  it('synchronizes the data provider on sign-in and restored sessions', async () => {
    const provider = new MockAuthProvider();

    await provider.signIn('employee1@demo.local', 'x');
    expect((await globalDataProvider.getUserSettings()).user_id).toBe('u2');
    expect(await globalDataProvider.getTelegramIdentity()).toBeNull();

    localStorage.setItem('corporate_chat_user_id', 'u1');
    expect(await provider.getCurrentUserId()).toBe('u1');
    expect((await globalDataProvider.getTelegramIdentity())?.profile_id).toBe('u1');
  });

  it('signOut clears the stored session', async () => {
    const provider = new MockAuthProvider();
    await provider.signIn('admin@demo.local', 'x');
    await provider.signOut();
    expect(await provider.getCurrentUserId()).toBeNull();
  });
});
