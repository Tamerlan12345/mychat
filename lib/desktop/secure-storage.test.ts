import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureStorage, secureStorage } from './secure-storage';
import type { DesktopBridge } from './types';

describe('SecureStorage', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as any).window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  describe('desktopBridge delegation (DPAPI)', () => {
    it('delegates setItem, getItem, and removeItem to desktopBridge when running in Electron', async () => {
      const mockBridge: DesktopBridge = {
        isDesktop: true,
        encryptAndSaveSecret: vi.fn().mockResolvedValue(true),
        getAndDecryptSecret: vi.fn().mockResolvedValue('decrypted-jwt-token'),
        removeSecret: vi.fn().mockResolvedValue(true),
        pingServer: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      };

      (globalThis as any).window = { desktopBridge: mockBridge };

      const storage = new SecureStorage();
      expect(storage.isDesktop).toBe(true);

      const saveResult = await storage.setItem('auth_token', 'my-secret-token');
      expect(saveResult).toBe(true);
      expect(mockBridge.encryptAndSaveSecret).toHaveBeenCalledWith('auth_token', 'my-secret-token');

      const val = await storage.getItem('auth_token');
      expect(val).toBe('decrypted-jwt-token');
      expect(mockBridge.getAndDecryptSecret).toHaveBeenCalledWith('auth_token');

      const removeResult = await storage.removeItem('auth_token');
      expect(removeResult).toBe(true);
      expect(mockBridge.removeSecret).toHaveBeenCalledWith('auth_token');
    });

    it('returns null when desktopBridge.getAndDecryptSecret returns null', async () => {
      const mockBridge: DesktopBridge = {
        isDesktop: true,
        encryptAndSaveSecret: vi.fn().mockResolvedValue(true),
        getAndDecryptSecret: vi.fn().mockResolvedValue(null),
        removeSecret: vi.fn().mockResolvedValue(true),
        pingServer: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      };

      (globalThis as any).window = { desktopBridge: mockBridge };

      const storage = new SecureStorage();
      const val = await storage.getItem('nonexistent_key');
      expect(val).toBeNull();
      expect(mockBridge.getAndDecryptSecret).toHaveBeenCalledWith('nonexistent_key');
    });
  });

  describe('localStorage fallback (Web Browser)', () => {
    it('falls back to browser localStorage when window.desktopBridge is absent', async () => {
      const storageMap = new Map<string, string>();
      const mockLocalStorage = {
        getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
        setItem: vi.fn((key: string, val: string) => {
          storageMap.set(key, val);
        }),
        removeItem: vi.fn((key: string) => {
          storageMap.delete(key);
        }),
        clear: vi.fn(() => {
          storageMap.clear();
        }),
      };

      (globalThis as any).window = { localStorage: mockLocalStorage };

      const storage = new SecureStorage();
      expect(storage.isDesktop).toBe(false);

      await storage.setItem('session_id', 'browser-sess-123');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('session_id', 'browser-sess-123');

      const val = await storage.getItem('session_id');
      expect(val).toBe('browser-sess-123');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('session_id');

      await storage.removeItem('session_id');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('session_id');
      expect(await storage.getItem('session_id')).toBeNull();
    });

    it('falls back to in-memory store if localStorage throws (e.g. storage disabled / quota exceeded)', async () => {
      const mockFailingLocalStorage = {
        getItem: vi.fn(() => {
          throw new Error('SecurityError: Access is denied');
        }),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError');
        }),
        removeItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
      };

      (globalThis as any).window = { localStorage: mockFailingLocalStorage };

      const storage = new SecureStorage();
      await storage.setItem('fallback_key', 'fallback_val');
      const val = await storage.getItem('fallback_key');
      expect(val).toBe('fallback_val');

      await storage.removeItem('fallback_key');
      expect(await storage.getItem('fallback_key')).toBeNull();
    });
  });

  describe('in-memory fallback (Node / SSR)', () => {
    it('falls back to in-memory storage when window is undefined without crashing', async () => {
      delete (globalThis as any).window;

      const storage = new SecureStorage();
      expect(storage.isDesktop).toBe(false);

      await storage.setItem('key', 'val');
      expect(await storage.getItem('key')).toBe('val');

      await storage.removeItem('key');
      expect(await storage.getItem('key')).toBeNull();
    });

    it('clears stored items with clear() in in-memory mode', async () => {
      delete (globalThis as any).window;

      const storage = new SecureStorage();
      await storage.setItem('key1', 'val1');
      await storage.setItem('key2', 'val2');

      await storage.clear();
      expect(await storage.getItem('key1')).toBeNull();
      expect(await storage.getItem('key2')).toBeNull();
    });
  });

  describe('prototype pollution and invalid key rejection', () => {
    beforeEach(() => {
      delete (globalThis as any).window;
    });

    it('rejects prototype pollution keys (__proto__, constructor, prototype)', async () => {
      const storage = new SecureStorage();
      const dangerousKeys = ['__proto__', 'constructor', 'prototype', '__PROTO__', 'nested.__proto__.prop'];

      for (const key of dangerousKeys) {
        await expect(storage.setItem(key, 'malicious')).rejects.toThrow();
        await expect(storage.getItem(key)).rejects.toThrow();
        await expect(storage.removeItem(key)).rejects.toThrow();
      }

      // Verify Object.prototype is untouched
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
    });

    it('rejects empty or whitespace-only keys', async () => {
      const storage = new SecureStorage();
      const emptyKeys = ['', '   ', '\t\n'];

      for (const key of emptyKeys) {
        await expect(storage.setItem(key, 'val')).rejects.toThrow();
        await expect(storage.getItem(key)).rejects.toThrow();
        await expect(storage.removeItem(key)).rejects.toThrow();
      }
    });

    it('rejects non-string keys', async () => {
      const storage = new SecureStorage();
      const nonStringKeys = [null, undefined, 123, {}, [], true] as any[];

      for (const key of nonStringKeys) {
        await expect(storage.setItem(key, 'val')).rejects.toThrow();
        await expect(storage.getItem(key)).rejects.toThrow();
        await expect(storage.removeItem(key)).rejects.toThrow();
      }
    });

    it('rejects non-string values in setItem', async () => {
      const storage = new SecureStorage();
      const nonStringValues = [null, undefined, 123, {}, []] as any[];

      for (const val of nonStringValues) {
        await expect(storage.setItem('valid_key', val)).rejects.toThrow();
      }
    });
  });

  describe('singleton export', () => {
    it('exports secureStorage instance of SecureStorage', () => {
      expect(secureStorage).toBeInstanceOf(SecureStorage);
      expect(typeof secureStorage.setItem).toBe('function');
      expect(typeof secureStorage.getItem).toBe('function');
      expect(typeof secureStorage.removeItem).toBe('function');
    });
  });
});
