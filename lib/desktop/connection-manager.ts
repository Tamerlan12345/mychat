import { secureStorage } from './secure-storage';
import type { PingServerResult, ServerConnectionConfig } from './types';
import { resetDataProvider } from '@/lib/provider';
import { resetAuthProvider } from '@/lib/auth';

export const STORAGE_KEY_URL = 'centras_custom_server_url';
export const STORAGE_KEY_ANON_KEY = 'centras_custom_anon_key';

const INITIAL_ENV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const INITIAL_ENV_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Validates that server URL has a valid format and uses HTTP or HTTPS protocol.
 */
export function validateServerUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') {
    throw new TypeError('Server URL must be a string');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Server URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    throw new Error(`Invalid URL format: ${err?.message || 'malformed URL'}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid server URL protocol. Only HTTP and HTTPS are supported, got "${parsed.protocol}"`);
  }

  // Remove trailing slashes for standard endpoint referencing
  return trimmed.replace(/\/+$/, '');
}

/**
 * Validates anon key parameter.
 */
export function validateAnonKey(rawKey: unknown): string {
  if (typeof rawKey !== 'string') {
    throw new TypeError('Anon key must be a string');
  }
  const trimmed = rawKey.trim();
  if (!trimmed) {
    throw new Error('Anon key must be a non-empty string');
  }
  return trimmed;
}

/**
 * Dynamic connection manager supporting runtime configuration,
 * secure DPAPI/localStorage credential persistence, and provider cache invalidation.
 */
export class ConnectionManager {
  private defaultUrl: string | undefined;
  private defaultAnonKey: string | undefined;

  constructor() {
    this.defaultUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? INITIAL_ENV_URL;
    this.defaultAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? INITIAL_ENV_KEY;
  }

  /**
   * Retrieves active server connection configuration.
   * Prioritizes custom configuration saved in secure storage,
   * falling back to build-time environment variables.
   */
  async getActiveConfig(): Promise<ServerConnectionConfig> {
    try {
      const customUrl = await secureStorage.getItem(STORAGE_KEY_URL);
      const customKey = await secureStorage.getItem(STORAGE_KEY_ANON_KEY);

      if (customUrl && customKey) {
        return {
          serverUrl: customUrl,
          anonKey: customKey,
          isCustom: true,
        };
      }
    } catch {
      // Fallback to environment variables on storage failure
    }

    return {
      serverUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || this.defaultUrl || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || this.defaultAnonKey || '',
      isCustom: false,
    };
  }

  /**
   * Validates and persists custom server connection configuration.
   * Updates runtime environment and invalidates data/auth provider caches.
   */
  async saveConfig(config: { serverUrl: string; anonKey: string }): Promise<void> {
    const validatedUrl = validateServerUrl(config.serverUrl);
    const validatedKey = validateAnonKey(config.anonKey);

    await secureStorage.setItem(STORAGE_KEY_URL, validatedUrl);
    await secureStorage.setItem(STORAGE_KEY_ANON_KEY, validatedKey);

    process.env.NEXT_PUBLIC_SUPABASE_URL = validatedUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = validatedKey;

    resetDataProvider();
    resetAuthProvider();
  }

  /**
   * Clears custom configuration from secure storage,
   * resets environment variables to defaults, and invalidates provider caches.
   */
  async clearCustomConfig(): Promise<void> {
    await secureStorage.removeItem(STORAGE_KEY_URL);
    await secureStorage.removeItem(STORAGE_KEY_ANON_KEY);

    const fallbackUrl = this.defaultUrl ?? INITIAL_ENV_URL;
    const fallbackKey = this.defaultAnonKey ?? INITIAL_ENV_KEY;

    if (fallbackUrl !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = fallbackUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }

    if (fallbackKey !== undefined) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = fallbackKey;
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }

    resetDataProvider();
    resetAuthProvider();
  }

  /**
   * Tests connection health against the specified or currently configured server URL.
   */
  async testConnection(targetUrl?: string, anonKey?: string): Promise<PingServerResult> {
    const url = targetUrl || (await this.getActiveConfig()).serverUrl;
    if (!url) {
      return { ok: false, error: 'Server URL is not configured' };
    }

    try {
      validateServerUrl(url);
    } catch (err: any) {
      return { ok: false, error: err.message || 'Invalid server URL' };
    }

    // 1. Electron desktop bridge delegation
    if (typeof window !== 'undefined' && window.desktopBridge?.pingServer) {
      try {
        return await window.desktopBridge.pingServer(url);
      } catch (err: any) {
        return { ok: false, error: err.message || 'Desktop bridge ping failed' };
      }
    }

    // 2. Browser / Node fetch health check with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const headers: Record<string, string> = {};
      const key = anonKey || (await this.getActiveConfig()).anonKey;
      if (key) {
        headers['apikey'] = key;
        headers['Authorization'] = `Bearer ${key}`;
      }

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return { ok: response.ok, status: response.status };
      } catch {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), 5000);
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: getController.signal,
        });
        clearTimeout(getTimeoutId);
        return { ok: response.ok, status: response.status };
      }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' };
    }
  }

  /**
   * Initializes runtime configuration from secure storage if present.
   */
  async init(): Promise<ServerConnectionConfig> {
    const config = await this.getActiveConfig();
    if (config.isCustom) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = config.serverUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = config.anonKey;
      resetDataProvider();
      resetAuthProvider();
    }
    return config;
  }
}

export const connectionManager = new ConnectionManager();
