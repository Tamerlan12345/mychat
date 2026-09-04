import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager, connectionManager } from './connection-manager';
import { secureStorage } from './secure-storage';

describe('ConnectionManager', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await secureStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    await secureStorage.clear();
    vi.restoreAllMocks();
  });

  describe('getActiveConfig', () => {
    it('retrieves default configuration from environment when no custom config is stored', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://default.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'default-anon-key';

      const mgr = new ConnectionManager();
      const config = await mgr.getActiveConfig();

      expect(config).toEqual({
        serverUrl: 'https://default.supabase.co',
        anonKey: 'default-anon-key',
        isCustom: false,
      });
    });

    it('returns empty defaults when environment variables are unset', async () => {
      const mgr = new ConnectionManager();
      const config = await mgr.getActiveConfig();

      expect(config).toEqual({
        serverUrl: '',
        anonKey: '',
        isCustom: false,
      });
    });

    it('returns custom stored configuration when present', async () => {
      const mgr = new ConnectionManager();
      await mgr.saveConfig({
        serverUrl: 'https://custom-server.example.com',
        anonKey: 'custom-jwt-key',
      });

      const config = await mgr.getActiveConfig();
      expect(config).toEqual({
        serverUrl: 'https://custom-server.example.com',
        anonKey: 'custom-jwt-key',
        isCustom: true,
      });
    });
  });

  describe('saveConfig and URL validation', () => {
    it('rejects malformed URLs', async () => {
      const mgr = new ConnectionManager();
      await expect(
        mgr.saveConfig({ serverUrl: 'not-a-valid-url', anonKey: 'key123' })
      ).rejects.toThrow(/Invalid URL/i);
    });

    it('rejects ftp:// URLs', async () => {
      const mgr = new ConnectionManager();
      await expect(
        mgr.saveConfig({ serverUrl: 'ftp://files.example.com', anonKey: 'key123' })
      ).rejects.toThrow(/Only HTTP and HTTPS/i);
    });

    it('rejects javascript: URLs', async () => {
      const mgr = new ConnectionManager();
      await expect(
        mgr.saveConfig({ serverUrl: 'javascript:alert(1)', anonKey: 'key123' })
      ).rejects.toThrow(/Only HTTP and HTTPS/i);
    });

    it('rejects empty or whitespace URLs', async () => {
      const mgr = new ConnectionManager();
      await expect(
        mgr.saveConfig({ serverUrl: '   ', anonKey: 'key123' })
      ).rejects.toThrow();
    });

    it('rejects empty or whitespace anon keys', async () => {
      const mgr = new ConnectionManager();
      await expect(
        mgr.saveConfig({ serverUrl: 'https://api.example.com', anonKey: '   ' })
      ).rejects.toThrow(/Anon key must be a non-empty string/i);
    });

    it('strips trailing slashes from valid URLs', async () => {
      const mgr = new ConnectionManager();
      await mgr.saveConfig({
        serverUrl: 'https://api.example.com///',
        anonKey: 'key123',
      });

      const config = await mgr.getActiveConfig();
      expect(config.serverUrl).toBe('https://api.example.com');
    });

    it('persists configuration via secureStorage and updates process.env', async () => {
      const mgr = new ConnectionManager();
      await mgr.saveConfig({
        serverUrl: 'https://tenant.supabase.co',
        anonKey: 'tenant-anon-key',
      });

      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://tenant.supabase.co');
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('tenant-anon-key');

      const storedUrl = await secureStorage.getItem('centras_custom_server_url');
      const storedKey = await secureStorage.getItem('centras_custom_anon_key');
      expect(storedUrl).toBe('https://tenant.supabase.co');
      expect(storedKey).toBe('tenant-anon-key');
    });
  });

  describe('clearCustomConfig', () => {
    it('clears custom configuration and resets to environment defaults', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://default.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'default-anon-key';

      const mgr = new ConnectionManager();
      await mgr.saveConfig({
        serverUrl: 'https://custom.supabase.co',
        anonKey: 'custom-anon-key',
      });

      let config = await mgr.getActiveConfig();
      expect(config.isCustom).toBe(true);

      await mgr.clearCustomConfig();

      config = await mgr.getActiveConfig();
      expect(config).toEqual({
        serverUrl: 'https://default.supabase.co',
        anonKey: 'default-anon-key',
        isCustom: false,
      });

      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://default.supabase.co');
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('default-anon-key');
    });
  });

  describe('testConnection', () => {
    it('delegates to desktopBridge.pingServer when available', async () => {
      const pingMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      (globalThis as any).window = {
        desktopBridge: {
          isDesktop: true,
          pingServer: pingMock,
        },
      };

      const mgr = new ConnectionManager();
      const res = await mgr.testConnection('https://server.example.com');

      expect(pingMock).toHaveBeenCalledWith('https://server.example.com');
      expect(res).toEqual({ ok: true, status: 200 });

      delete (globalThis as any).window;
    });

    it('performs fetch check when desktopBridge is not available', async () => {
      delete (globalThis as any).window;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const mgr = new ConnectionManager();
      const res = await mgr.testConnection('https://server.example.com');

      expect(fetchSpy).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
    });

    it('returns error result on fetch network failure without throwing', async () => {
      delete (globalThis as any).window;
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const mgr = new ConnectionManager();
      const res = await mgr.testConnection('https://unreachable.example.com');

      expect(res.ok).toBe(false);
      expect(res.error).toBe('Network error');
    });

    it('returns error result when testing an invalid URL without throwing', async () => {
      const mgr = new ConnectionManager();
      const res = await mgr.testConnection('invalid-url');

      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('singleton export', () => {
    it('exports a singleton connectionManager instance', () => {
      expect(connectionManager).toBeInstanceOf(ConnectionManager);
    });
  });
});
