import type { ISecureStorage } from './types';

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Validates storage key against prototype pollution and malformed inputs.
 * Rejects non-strings, empty/whitespace strings, and prototype pollution attempts.
 */
export function assertValidStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new TypeError('Storage key must be a string');
  }
  const trimmed = key.trim();
  if (trimmed === '') {
    throw new Error('Storage key cannot be empty');
  }
  if (
    FORBIDDEN_KEYS.has(trimmed) ||
    FORBIDDEN_KEYS.has(trimmed.toLowerCase()) ||
    trimmed.includes('__proto__')
  ) {
    throw new Error(`Invalid or dangerous storage key: ${key}`);
  }
}

/**
 * Validates that storage value is a valid string.
 */
export function assertValidStorageValue(value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError('Storage value must be a string');
  }
}

/**
 * DPAPI-backed secure storage adapter with browser localStorage and SSR in-memory fallbacks.
 */
export class SecureStorage implements ISecureStorage {
  private memoryStore: Map<string, string>;

  constructor() {
    this.memoryStore = new Map<string, string>();
  }

  /**
   * Indicates whether desktop DPAPI bridge is active in the current execution context.
   */
  get isDesktop(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean(window.desktopBridge?.isDesktop)
    );
  }

  /**
   * Persist a secret key-value pair.
   * Priority: Electron safeStorage DPAPI -> window.localStorage -> in-memory Map.
   */
  async setItem(key: string, value: string): Promise<boolean> {
    assertValidStorageKey(key);
    assertValidStorageValue(value);

    // 1. Electron Desktop DPAPI delegation
    if (typeof window !== 'undefined' && window.desktopBridge) {
      return window.desktopBridge.encryptAndSaveSecret(key, value);
    }

    // 2. Browser localStorage fallback
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        // Fallback to memory store if localStorage throws (e.g. QuotaExceededError or security restrictions)
        this.memoryStore.set(key, value);
        return true;
      }
    }

    // 3. In-memory fallback (Node.js, SSR, headless)
    this.memoryStore.set(key, value);
    return true;
  }

  /**
   * Retrieve a secret by key.
   * Priority: Electron safeStorage DPAPI -> window.localStorage -> in-memory Map.
   */
  async getItem(key: string): Promise<string | null> {
    assertValidStorageKey(key);

    // 1. Electron Desktop DPAPI delegation
    if (typeof window !== 'undefined' && window.desktopBridge) {
      return window.desktopBridge.getAndDecryptSecret(key);
    }

    // 2. Browser localStorage fallback
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const val = window.localStorage.getItem(key);
        if (val !== null) {
          return val;
        }
      } catch {
        return this.memoryStore.get(key) ?? null;
      }
      return this.memoryStore.get(key) ?? null;
    }

    // 3. In-memory fallback
    return this.memoryStore.get(key) ?? null;
  }

  /**
   * Remove a secret by key.
   * Priority: Electron safeStorage DPAPI -> window.localStorage -> in-memory Map.
   */
  async removeItem(key: string): Promise<boolean> {
    assertValidStorageKey(key);

    // 1. Electron Desktop DPAPI delegation
    if (typeof window !== 'undefined' && window.desktopBridge) {
      return window.desktopBridge.removeSecret(key);
    }

    // 2. Browser localStorage fallback
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Continue to remove from memory store
      }
      this.memoryStore.delete(key);
      return true;
    }

    // 3. In-memory fallback
    this.memoryStore.delete(key);
    return true;
  }

  /**
   * Clear in-memory and browser local storage stores.
   */
  async clear(): Promise<void> {
    this.memoryStore.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore clear errors
      }
    }
  }
}

export const secureStorage = new SecureStorage();
