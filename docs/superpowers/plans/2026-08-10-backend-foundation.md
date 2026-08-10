# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Centras Chat's mock-only backend with a real Supabase backend (Auth + Postgres + Realtime) selected automatically at runtime, while the existing mock provider keeps working with zero config — this is Plan 1 of 5 from `docs/superpowers/specs/2026-08-10-product-version-design.md` and is the prerequisite for the file-storage, calls, and Telegram plans that follow.

**Architecture:** Two parallel abstractions already partially exist and get completed here: `IDataProvider` (data) and a new `IAuthProvider` (identity/session), each with a `Mock*` and `Supabase*` implementation, chosen by a single `resolveProviderMode()` function based on env vars. Services and React contexts depend only on the interfaces, never on a concrete implementation.

**Tech Stack:** Next.js 14 (App Router), TypeScript (strict), `@supabase/supabase-js` v2, Vitest (new — no test runner exists yet), Supabase Postgres/Auth/Realtime.

## Global Constraints

- TypeScript strict mode is already on (`tsconfig.json`) — every new file must type-check under it.
- Path alias `@/*` maps to the repo root — use it in imports (matches existing code).
- `npm run build` (`next build`) must stay green after every task.
- Existing mock-provider behavior must not regress — the app must keep working with zero env vars configured (Decision #3 in `PROJECT.md`).
- Russian-language UI strings stay Russian (matches existing app copy).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (new) | Test runner config |
| `lib/provider/index.ts` (new) | `resolveProviderMode()` (Task 2) + `getDataProvider()` factory (Task 13) |
| `lib/provider/supabase-client.ts` (new) | Singleton browser Supabase client |
| `lib/provider/supabase-provider.ts` (new) | `SupabaseDataProvider implements IDataProvider` (Tasks 8–12) |
| `lib/auth/auth-provider.ts` (new) | `IAuthProvider` interface |
| `lib/auth/mock-auth-provider.ts` (new) | `MockAuthProvider` — extracted from current `AuthContext` login logic |
| `lib/auth/supabase-auth-provider.ts` (new) | `SupabaseAuthProvider` — real `signInWithPassword` |
| `lib/auth/index.ts` (new) | `getAuthProvider()` factory |
| `lib/auth/auth-context.tsx` (modify) | Use `getAuthProvider()` instead of hardcoded mock logic; `login()` now takes a password |
| `app/login/page.tsx` (modify) | Pass real password through to `login()` |
| `app/api/audit-ip/route.ts` (new) | Server-side client IP capture for audit logs |
| `supabase/migrations/002_auth_and_rls.sql` (new) | Auth linkage, RLS policies, trigger |
| `services/*.ts` (modify, 6 files) | Import `getDataProvider()` instead of `globalDataProvider` directly |
| `scripts/seed-supabase.ts` (new) | Seeds a real Supabase project with the same demo data the mock provider ships with |
| `.env.local.example` (new) | Documents every required env var |
| `docs/SUPABASE_SETUP.md` (new) | Step-by-step real-project setup guide |

---

### Task 1: Add the Vitest test runner

No test runner exists in this project yet — every TDD step in this plan depends on it.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Create the config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add Vitest test runner"
```

---

### Task 2: Provider mode resolution (`resolveProviderMode`)

Pure function that decides mock vs. Supabase based on env vars — this is the switch the whole plan hinges on, and it's fully unit-testable without any external service.

**Files:**
- Create: `lib/provider/index.ts`
- Test: `lib/provider/index.test.ts`

**Interfaces:**
- Produces: `resolveProviderMode(env: Record<string, string | undefined>): 'mock' | 'supabase'` — throws `Error` if exactly one of the two env vars is set. Used again in Task 6 (`lib/auth/index.ts`) and Task 13 (`getDataProvider()`).

- [ ] **Step 1: Write the failing test**

```ts
// lib/provider/index.test.ts
import { describe, it, expect } from 'vitest';
import { resolveProviderMode } from './index';

describe('resolveProviderMode', () => {
  it('returns "mock" when no Supabase env vars are set', () => {
    expect(resolveProviderMode({})).toBe('mock');
  });

  it('returns "supabase" when both env vars are set', () => {
    expect(
      resolveProviderMode({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      })
    ).toBe('supabase');
  });

  it('throws when only the URL is set', () => {
    expect(() =>
      resolveProviderMode({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })
    ).toThrow(/must be set together/);
  });

  it('throws when only the anon key is set', () => {
    expect(() => resolveProviderMode({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' })).toThrow(
      /must be set together/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/index.test.ts`
Expected: FAIL — `resolveProviderMode` is not exported / module has no such export.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/provider/index.ts
export type ProviderMode = 'mock' | 'supabase';

export function resolveProviderMode(env: Record<string, string | undefined>): ProviderMode {
  const hasUrl = !!env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (hasUrl && hasKey) return 'supabase';
  if (!hasUrl && !hasKey) return 'mock';

  throw new Error(
    'Incomplete Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set together, or neither (to use the mock provider).'
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/index.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/provider/index.ts lib/provider/index.test.ts
git commit -m "feat: add resolveProviderMode for mock/Supabase selection"
```

---

### Task 3: Supabase browser client singleton + env template

**Files:**
- Create: `lib/provider/supabase-client.ts`
- Create: `.env.local.example`

**Interfaces:**
- Produces: `getSupabaseClient(): SupabaseClient` — throws if env vars are missing. Consumed by `SupabaseDataProvider` (Tasks 8–12), `SupabaseAuthProvider` (Task 5).

- [ ] **Step 1: Create the client singleton**

```ts
// lib/provider/supabase-client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'getSupabaseClient() called without NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY set.'
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
```

This has no automated test — it's a thin wrapper around `createClient` with no branching logic beyond the guard clause, which is exercised implicitly by every Supabase-mode test in later tasks (via a mocked module, see Task 8).

- [ ] **Step 2: Create the env template**

```bash
# .env.local.example
# Copy to .env.local and fill in to run against a real Supabase project.
# Leave all of these unset to run against the built-in mock provider (zero setup).

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-side only — never exposed to the browser. Used by scripts/seed-supabase.ts
# and by app/api routes that need elevated privileges.
SUPABASE_SERVICE_ROLE_KEY=

# Filled in by the Telegram plan (docs/superpowers/specs/2026-08-10-product-version-design.md §6):
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add lib/provider/supabase-client.ts .env.local.example
git commit -m "feat: add Supabase client singleton and env template"
```

---

### Task 4: `IAuthProvider` interface + `MockAuthProvider`

Extracts the login logic currently inline in `lib/auth/auth-context.tsx:50-69` into a standalone, swappable provider — behavior must stay identical (any password accepted, blocked users rejected, session in `localStorage`).

**Files:**
- Create: `lib/auth/auth-provider.ts`
- Create: `lib/auth/mock-auth-provider.ts`
- Test: `lib/auth/mock-auth-provider.test.ts`

**Interfaces:**
- Produces: `IAuthProvider` (methods: `signIn`, `signOut`, `getCurrentUserId`, `onAuthStateChange`), `AuthResult` type, `MockAuthProvider` class. Consumed by `lib/auth/index.ts` (Task 6).
- Consumes: `globalDataProvider` from `lib/provider/mock-provider` (existing).

- [ ] **Step 1: Write the interface (no test needed — a type has no behavior)**

```ts
// lib/auth/auth-provider.ts
export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export interface IAuthProvider {
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getCurrentUserId(): Promise<string | null>;
  onAuthStateChange(callback: (userId: string | null) => void): () => void;
}
```

- [ ] **Step 2: Write the failing test for `MockAuthProvider`**

```ts
// lib/auth/mock-auth-provider.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockAuthProvider } from './mock-auth-provider';
import { globalDataProvider } from '@/lib/provider/mock-provider';

describe('MockAuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('signOut clears the stored session', async () => {
    const provider = new MockAuthProvider();
    await provider.signIn('admin@demo.local', 'x');
    await provider.signOut();
    expect(await provider.getCurrentUserId()).toBeNull();
  });
});
```

This test needs `localStorage` in a Node test environment — Vitest's default `node` environment doesn't have it. Switch this file's environment with a docblock pragma rather than changing the global config (keeps other tests fast):

```ts
// @vitest-environment jsdom
```
Add this as the very first line of `lib/auth/mock-auth-provider.test.ts`, above the imports.

- [ ] **Step 2b: Install jsdom (needed for the pragma above)**

Run: `npm install -D jsdom`

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- lib/auth/mock-auth-provider.test.ts`
Expected: FAIL — `./mock-auth-provider` has no exported member `MockAuthProvider`.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/auth/mock-auth-provider.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- lib/auth/mock-auth-provider.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/auth/auth-provider.ts lib/auth/mock-auth-provider.ts lib/auth/mock-auth-provider.test.ts package.json package-lock.json
git commit -m "feat: extract MockAuthProvider behind IAuthProvider"
```

---

### Task 5: `SupabaseAuthProvider`

**Files:**
- Create: `lib/auth/supabase-auth-provider.ts`
- Test: `lib/auth/supabase-auth-provider.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient` from `lib/provider/supabase-client` (Task 3) — mocked in the test.
- Produces: `SupabaseAuthProvider` class, `mapAuthError(message?: string): string` (exported for direct testing). Consumed by `lib/auth/index.ts` (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/auth/supabase-auth-provider.test.ts`
Expected: FAIL — module `./supabase-auth-provider` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/supabase-auth-provider.ts
import { IAuthProvider, AuthResult } from './auth-provider';
import { getSupabaseClient } from '@/lib/provider/supabase-client';

export function mapAuthError(message?: string): string {
  if (!message) return 'Ошибка входа в систему.';
  if (message.includes('Invalid login credentials')) return 'Неверный email или пароль.';
  return message;
}

export class SupabaseAuthProvider implements IAuthProvider {
  async signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { success: false, error: mapAuthError(error?.message) };
    }
    return { success: true, userId: data.user.id };
  }

  async signOut(): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  }

  async getCurrentUserId(): Promise<string | null> {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  }

  onAuthStateChange(callback: (userId: string | null) => void): () => void {
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      callback(session?.user?.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/auth/supabase-auth-provider.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth/supabase-auth-provider.ts lib/auth/supabase-auth-provider.test.ts
git commit -m "feat: add SupabaseAuthProvider"
```

---

### Task 6: Auth provider factory + rewire `AuthContext` and login page

This is where real password checking actually reaches the UI.

**Files:**
- Create: `lib/auth/index.ts`
- Modify: `lib/auth/auth-context.tsx`
- Modify: `app/login/page.tsx`
- Test: `lib/auth/index.test.ts`

**Interfaces:**
- Consumes: `resolveProviderMode` (Task 2), `MockAuthProvider` (Task 4), `SupabaseAuthProvider` (Task 5).
- Produces: `getAuthProvider(): IAuthProvider`.
- Changes existing interface: `AuthContextType.login` signature changes from `(email: string) => Promise<...>` to `(email: string, password: string) => Promise<...>`.

- [ ] **Step 1: Write the failing test for the factory**

```ts
// lib/auth/index.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getAuthProvider', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('returns a MockAuthProvider when no Supabase env vars are set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getAuthProvider } = await import('./index');
    const { MockAuthProvider } = await import('./mock-auth-provider');
    expect(getAuthProvider()).toBeInstanceOf(MockAuthProvider);
  });

  it('returns a SupabaseAuthProvider when both env vars are set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { getAuthProvider } = await import('./index');
    const { SupabaseAuthProvider } = await import('./supabase-auth-provider');
    expect(getAuthProvider()).toBeInstanceOf(SupabaseAuthProvider);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/auth/index.test.ts`
Expected: FAIL — `./index` module doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/index.ts
import type { IAuthProvider } from './auth-provider';
import { MockAuthProvider } from './mock-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';
import { resolveProviderMode } from '@/lib/provider';

let cached: IAuthProvider | null = null;

export function getAuthProvider(): IAuthProvider {
  if (!cached) {
    const mode = resolveProviderMode(process.env as Record<string, string | undefined>);
    cached = mode === 'supabase' ? new SupabaseAuthProvider() : new MockAuthProvider();
  }
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/auth/index.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Rewire `AuthContext`**

Replace the full contents of `lib/auth/auth-context.tsx`:

```tsx
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
```

- [ ] **Step 6: Pass the real password through on the login page**

In `app/login/page.tsx`, change the submit handler (currently `const res = await login(email);` around line 24):

```tsx
const res = await login(email, password);
```

- [ ] **Step 7: Run the full test suite and the build**

Run: `npm run test`
Expected: all tests PASS.

Run: `npm run build`
Expected: succeeds (this exercises `app/login/page.tsx` and `lib/auth/auth-context.tsx` through Next's type-checking build step).

- [ ] **Step 8: Manual regression check (mock mode)**

Run: `npm run dev`, open `http://localhost:3000`. Use the "Админ" quick-select button on the login page, submit. Expected: lands on `/chat` as before — mock mode still ignores the password, so this must work exactly as it did before this task.

- [ ] **Step 9: Commit**

```bash
git add lib/auth/index.ts lib/auth/index.test.ts lib/auth/auth-context.tsx app/login/page.tsx
git commit -m "feat: real password auth via IAuthProvider, wired into AuthContext"
```

---

### Task 7: Migration `002_auth_and_rls.sql`

No unit test is possible here — this SQL only runs against a real Postgres instance, and this environment has no Supabase CLI/Docker available. Verification is a manual checklist run against a real project (either by you, or by me if you provide credentials later).

**Files:**
- Create: `supabase/migrations/002_auth_and_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Corporate Chat — Auth linkage & RLS
-- Migration: 002_auth_and_rls.sql
-- Depends on: 001_initial_schema.sql

-- 1. Link profiles to Supabase Auth users, and auto-create a profile on signup.
ALTER TABLE profiles
    ADD CONSTRAINT fk_profiles_auth_user FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, first_name, last_name, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', 'Сотрудник'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', 'Новый'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'EMPLOYEE'),
        'OFFLINE'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- 2. Enable RLS on every table that holds tenant data.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an ADMIN or SUPER_ADMIN?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: is the current user a member of the given conversation?
CREATE OR REPLACE FUNCTION is_conversation_member(conv_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM conversation_members WHERE conversation_id = conv_id AND user_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Policies.

-- profiles: company directory is readable by any authenticated user; only the
-- owner or an admin can update; only an admin can delete or insert directly
-- (normal signup goes through the trigger above, which runs as SECURITY DEFINER).
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR is_admin());
CREATE POLICY profiles_admin_delete ON profiles FOR DELETE TO authenticated USING (is_admin());

-- departments: readable by all, writable only by admins.
CREATE POLICY departments_select ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_admin_write ON departments FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- conversations: visible/editable only to members (or an admin).
CREATE POLICY conversations_member_select ON conversations FOR SELECT TO authenticated
    USING (is_conversation_member(id) OR is_admin());
CREATE POLICY conversations_authenticated_insert ON conversations FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());
CREATE POLICY conversations_member_update ON conversations FOR UPDATE TO authenticated
    USING (is_conversation_member(id) OR is_admin());

-- conversation_members: visible to other members of the same conversation.
CREATE POLICY members_select ON conversation_members FOR SELECT TO authenticated
    USING (is_conversation_member(conversation_id) OR is_admin());
CREATE POLICY members_insert ON conversation_members FOR INSERT TO authenticated
    WITH CHECK (is_conversation_member(conversation_id) OR is_admin());
CREATE POLICY members_delete ON conversation_members FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR is_admin());

-- messages: only conversation members can read/write.
CREATE POLICY messages_select ON messages FOR SELECT TO authenticated
    USING (is_conversation_member(conversation_id));
CREATE POLICY messages_insert ON messages FOR INSERT TO authenticated
    WITH CHECK (is_conversation_member(conversation_id) AND sender_id = auth.uid());
CREATE POLICY messages_update_own ON messages FOR UPDATE TO authenticated
    USING (sender_id = auth.uid());

-- message_reactions: only conversation members, scoped via the parent message.
CREATE POLICY reactions_select ON message_reactions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));
CREATE POLICY reactions_insert ON message_reactions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)
    ));
CREATE POLICY reactions_delete_own ON message_reactions FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- attachments: scoped via the parent message's conversation.
CREATE POLICY attachments_select ON attachments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));
CREATE POLICY attachments_insert ON attachments FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND is_conversation_member(m.conversation_id)));

-- user_settings: owner only.
CREATE POLICY settings_owner ON user_settings FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- branding_config: readable by all authenticated users, writable only by admins.
CREATE POLICY branding_select ON branding_config FOR SELECT TO authenticated USING (true);
CREATE POLICY branding_admin_write ON branding_config FOR UPDATE TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- audit_logs: admin-only read; inserts happen via SECURITY DEFINER from app code
-- using the service role, so no INSERT policy is granted to `authenticated`.
CREATE POLICY audit_admin_select ON audit_logs FOR SELECT TO authenticated USING (is_admin());

-- telegram_accounts: owner only.
CREATE POLICY telegram_owner ON telegram_accounts FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. Storage bucket for attachments (used starting with the File Storage plan,
-- created now so the setup guide only needs one migration for auth+storage).
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY attachments_bucket_read ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'attachments'
        AND is_conversation_member((storage.foldername(name))[1]::uuid)
    );
CREATE POLICY attachments_bucket_write ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'attachments'
        AND is_conversation_member((storage.foldername(name))[1]::uuid)
    );
```

- [ ] **Step 2: Manual verification checklist (run against a real Supabase project — see Task 15)**

- [ ] Paste the full contents of `001_initial_schema.sql` then `002_auth_and_rls.sql` into the Supabase SQL editor, in that order; both run with no errors.
- [ ] `select * from pg_policies where schemaname = 'public';` shows a row for every `CREATE POLICY` above.
- [ ] Sign up a test user via `supabase.auth.signUp` (or the Auth UI) → a matching row appears in `profiles` automatically.
- [ ] As that user, `select * from conversations;` returns only conversations they're a member of, not all of them.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_auth_and_rls.sql
git commit -m "feat: add auth linkage, RLS policies, and attachments bucket migration"
```

---

### Task 8: `SupabaseDataProvider` — Users & Departments

Establishes the pattern the rest of the provider follows: thin Supabase queries plus a small, independently-tested row-mapping function.

**Files:**
- Create: `lib/provider/supabase-provider.ts`
- Test: `lib/provider/supabase-provider.test.ts`

**Interfaces:**
- Consumes: `IDataProvider` (existing, `lib/provider/data-provider.ts`), `getSupabaseClient` (Task 3, mocked in tests).
- Produces: `mapProfileRow(row: any): User` (exported, directly tested), `SupabaseDataProvider` class (built out across Tasks 8–12; must fully `implements IDataProvider` only once Task 12 lands — until then it will not type-check as a drop-in replacement, which is fine since nothing references it yet).

- [ ] **Step 1: Write the failing test**

```ts
// lib/provider/supabase-provider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
vi.mock('./supabase-client', () => ({
  getSupabaseClient: () => ({ from }),
}));

import { SupabaseDataProvider, mapProfileRow } from './supabase-provider';

describe('mapProfileRow', () => {
  it('maps a joined profile row to the User shape', () => {
    const row = {
      id: 'uuid-1',
      email: 'a@b.com',
      first_name: 'Иван',
      last_name: 'Петров',
      avatar_url: null,
      phone: '+7 999',
      position: 'Engineer',
      department_id: 'd1',
      departments: { name: 'AI' },
      status: 'ONLINE',
      role: 'EMPLOYEE',
      last_seen: '2026-08-10T00:00:00Z',
      created_at: '2026-08-10T00:00:00Z',
      updated_at: '2026-08-10T00:00:00Z',
    };
    const user = mapProfileRow(row);
    expect(user.id).toBe('uuid-1');
    expect(user.department_name).toBe('AI');
  });

  it('leaves department_name undefined when there is no joined department', () => {
    const row = {
      id: 'uuid-2', email: 'c@d.com', first_name: 'A', last_name: 'B',
      status: 'OFFLINE', role: 'EMPLOYEE', last_seen: '2026-08-10T00:00:00Z',
      created_at: '2026-08-10T00:00:00Z', updated_at: '2026-08-10T00:00:00Z',
      department_id: null, departments: null,
    };
    expect(mapProfileRow(row).department_name).toBeUndefined();
  });
});

describe('SupabaseDataProvider.getUsers', () => {
  beforeEach(() => from.mockReset());

  it('queries the profiles table with the department join, ordered by first name', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const provider = new SupabaseDataProvider();
    await provider.getUsers();

    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('*, departments(name)');
    expect(order).toHaveBeenCalledWith('first_name');
  });

  it('throws a descriptive error when the query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });

    const provider = new SupabaseDataProvider();
    await expect(provider.getUsers()).rejects.toThrow(/connection refused/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/provider/supabase-provider.ts
import { getSupabaseClient } from './supabase-client';
import { User, Department } from '@/types';

export function mapProfileRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    avatar_url: row.avatar_url ?? undefined,
    phone: row.phone ?? undefined,
    position: row.position ?? undefined,
    department_id: row.department_id ?? undefined,
    department_name: row.departments?.name ?? undefined,
    status: row.status,
    role: row.role,
    last_seen: row.last_seen,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapDepartmentRow(row: any): Department {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    created_at: row.created_at,
    member_count: row.member_count,
  };
}

export class SupabaseDataProvider {
  private get client() {
    return getSupabaseClient();
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const { data, error } = await this.client.from('profiles').select('*, departments(name)').order('first_name');
    if (error) throw new Error(`getUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getUserById failed: ${error.message}`);
    return data ? mapProfileRow(data) : null;
  }

  async searchUsers(query: string): Promise<User[]> {
    const q = query.trim();
    if (!q) return this.getUsers();
    const { data, error } = await this.client
      .from('profiles')
      .select('*, departments(name)')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,position.ilike.%${q}%`);
    if (error) throw new Error(`searchUsers failed: ${error.message}`);
    return (data ?? []).map(mapProfileRow);
  }

  async createUser(userData: Partial<User>): Promise<User> {
    // Real signup happens via Supabase Auth (see docs/SUPABASE_SETUP.md and
    // scripts/seed-supabase.ts) — the handle_new_auth_user() trigger creates the
    // profiles row. This method covers admin edits to an existing profile's fields
    // that aren't part of signup (e.g. an admin pre-provisioning a department).
    throw new Error(
      'createUser: direct profile creation is not supported in Supabase mode — users are created via Supabase Auth signup, which auto-creates their profile.'
    );
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const { department_name, ...rest } = updates;
    const { data, error } = await this.client
      .from('profiles')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, departments(name)')
      .single();
    if (error) throw new Error(`updateUser failed: ${error.message}`);
    return mapProfileRow(data);
  }

  async deleteUser(id: string): Promise<boolean> {
    const { error } = await this.client.from('profiles').delete().eq('id', id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
    return true;
  }

  async setUserStatus(id: string, status: User['status']): Promise<User> {
    return this.updateUser(id, { status });
  }

  // --- DEPARTMENTS ---
  async getDepartments(): Promise<Department[]> {
    const { data, error } = await this.client.from('departments').select('*, profiles(count)');
    if (error) throw new Error(`getDepartments failed: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      ...mapDepartmentRow(row),
      member_count: row.profiles?.[0]?.count ?? 0,
    }));
  }

  async createDepartment(name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .insert({ name, description })
      .select()
      .single();
    if (error) throw new Error(`createDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    const { data, error } = await this.client
      .from('departments')
      .update({ name, description })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateDepartment failed: ${error.message}`);
    return mapDepartmentRow(data);
  }

  async deleteDepartment(id: string): Promise<boolean> {
    const { error } = await this.client.from('departments').delete().eq('id', id);
    if (error) throw new Error(`deleteDepartment failed: ${error.message}`);
    return true;
  }
}
```

Note: `createUser` intentionally throws — see the comment. `services/user-service.ts` isn't wired to the factory until Task 13; the admin "create user" UI flow gets updated in that same task to call Supabase Auth signup instead of this method, so the throw is never hit in practice by the time Supabase mode is live.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/provider/supabase-provider.ts lib/provider/supabase-provider.test.ts
git commit -m "feat: SupabaseDataProvider — users and departments"
```

---

### Task 9: `SupabaseDataProvider` — Conversations, Members, Messages, Reactions, Realtime

**Files:**
- Modify: `lib/provider/supabase-provider.ts`
- Modify: `lib/provider/supabase-provider.test.ts`

**Interfaces:**
- Produces (added to `SupabaseDataProvider`): `getConversations`, `getConversationById`, `createConversation`, `addMembers`, `removeMember`, `markConversationAsRead`, `getMessages`, `sendMessage`, `editMessage`, `deleteMessage`, `addReaction`, `removeReaction`, `subscribeToMessages`. Also exports `mapMessageRow(row: any): Message` and `mapConversationRow(row: any): Conversation` for direct testing.

- [ ] **Step 1: Add failing tests**

Append to `lib/provider/supabase-provider.test.ts`:

```ts
describe('mapMessageRow', () => {
  it('maps a message row with nested sender and reactions', async () => {
    const { mapMessageRow } = await import('./supabase-provider');
    const row = {
      id: 'm1', conversation_id: 'c1', sender_id: 'u1',
      profiles: { first_name: 'Иван', last_name: 'Петров', avatar_url: 'a.png' },
      content: 'Привет', message_type: 'TEXT', reply_to: null,
      edited_at: null, deleted_at: null, created_at: '2026-08-10T00:00:00Z',
      message_reactions: [{ id: 'r1', message_id: 'm1', user_id: 'u2', reaction: '👍', created_at: '2026-08-10T00:00:00Z', profiles: { first_name: 'A', last_name: 'B' } }],
      attachments: [],
    };
    const msg = mapMessageRow(row);
    expect(msg.sender_name).toBe('Иван Петров');
    expect(msg.reactions?.[0].reaction).toBe('👍');
  });
});

describe('SupabaseDataProvider.sendMessage', () => {
  beforeEach(() => from.mockReset());

  it('inserts into messages with the given fields and returns the mapped row', async () => {
    const insertedRow = {
      id: 'm2', conversation_id: 'c1', sender_id: 'u1',
      profiles: { first_name: 'Иван', last_name: 'Петров', avatar_url: null },
      content: 'Hello', message_type: 'TEXT', reply_to: undefined,
      edited_at: null, deleted_at: null, created_at: '2026-08-10T00:00:00Z',
      message_reactions: [], attachments: [],
    };
    const single = vi.fn().mockResolvedValue({ data: insertedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    from.mockReturnValue({ insert });

    const provider = new SupabaseDataProvider();
    const result = await provider.sendMessage({ conversation_id: 'c1', sender_id: 'u1', content: 'Hello' });

    expect(from).toHaveBeenCalledWith('messages');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: 'c1', sender_id: 'u1', content: 'Hello', message_type: 'TEXT' })
    );
    expect(result.id).toBe('m2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: FAIL — `mapMessageRow` not exported.

- [ ] **Step 3: Implement**

Add to `lib/provider/supabase-provider.ts` (imports at top need `Conversation, Message, MessageReaction, Attachment` added to the existing `@/types` import):

```ts
export function mapMessageRow(row: any): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}` : undefined,
    sender_avatar: row.profiles?.avatar_url ?? undefined,
    content: row.content,
    message_type: row.message_type,
    reply_to: row.reply_to ?? undefined,
    edited_at: row.edited_at ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
    created_at: row.created_at,
    reactions: (row.message_reactions ?? []).map((r: any) => ({
      id: r.id,
      message_id: r.message_id,
      user_id: r.user_id,
      user_name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : undefined,
      reaction: r.reaction,
      created_at: r.created_at,
    })),
    attachments: (row.attachments ?? []).map((a: any) => ({
      id: a.id,
      message_id: a.message_id,
      file_name: a.file_name,
      file_path: a.file_path,
      mime_type: a.mime_type,
      size: a.size,
      created_at: a.created_at,
    })),
  };
}

export function mapConversationRow(row: any): Conversation {
  return {
    id: row.id,
    type: row.type,
    name: row.name ?? undefined,
    avatar_url: row.avatar_url ?? undefined,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_private: row.is_private ?? undefined,
    description: row.description ?? undefined,
  };
}

const MESSAGE_SELECT = '*, profiles(first_name, last_name, avatar_url), message_reactions(*, profiles(first_name, last_name)), attachments(*)';
```

Then extend the `SupabaseDataProvider` class body (inside the class, after the departments methods):

```ts
  // --- CONVERSATIONS ---
  async getConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversation_members')
      .select('conversations(*)')
      .eq('user_id', userId);
    if (error) throw new Error(`getConversations failed: ${error.message}`);
    const conversations = (data ?? []).map((row: any) => mapConversationRow(row.conversations));

    return Promise.all(
      conversations.map(async conv => {
        const { data: lastMsgRows } = await this.client
          .from('messages')
          .select(MESSAGE_SELECT)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const { data: memberRow } = await this.client
          .from('conversation_members')
          .select('last_read_message_id')
          .eq('conversation_id', conv.id)
          .eq('user_id', userId)
          .maybeSingle();

        let unreadCountQuery = this.client
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId);

        if (memberRow?.last_read_message_id) {
          const { data: lastReadRow } = await this.client
            .from('messages')
            .select('created_at')
            .eq('id', memberRow.last_read_message_id)
            .maybeSingle();
          if (lastReadRow) {
            unreadCountQuery = unreadCountQuery.gt('created_at', lastReadRow.created_at);
          }
        }

        const { count } = await unreadCountQuery;

        return {
          ...conv,
          last_message: lastMsgRows?.[0] ? mapMessageRow(lastMsgRows[0]) : undefined,
          unread_count: count ?? 0,
        };
      })
    );
  }

  async getConversationById(id: string): Promise<Conversation | null> {
    const { data, error } = await this.client.from('conversations').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`getConversationById failed: ${error.message}`);
    return data ? mapConversationRow(data) : null;
  }

  async createConversation(data: {
    type: 'DIRECT' | 'GROUP' | 'CHANNEL';
    name?: string;
    description?: string;
    created_by: string;
    is_private?: boolean;
    member_ids: string[];
  }): Promise<Conversation> {
    const { data: convRow, error } = await this.client
      .from('conversations')
      .insert({
        type: data.type,
        name: data.name,
        description: data.description,
        created_by: data.created_by,
        is_private: data.is_private ?? false,
      })
      .select()
      .single();
    if (error) throw new Error(`createConversation failed: ${error.message}`);

    const memberIds = Array.from(new Set([...data.member_ids, data.created_by]));
    const { error: memberError } = await this.client
      .from('conversation_members')
      .insert(memberIds.map(userId => ({ conversation_id: convRow.id, user_id: userId })));
    if (memberError) throw new Error(`createConversation (members) failed: ${memberError.message}`);

    return mapConversationRow(convRow);
  }

  async addMembers(conversationId: string, userIds: string[]): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .insert(userIds.map(userId => ({ conversation_id: conversationId, user_id: userId })));
    if (error) throw new Error(`addMembers failed: ${error.message}`);
    return true;
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) throw new Error(`removeMember failed: ${error.message}`);
    return true;
  }

  async markConversationAsRead(conversationId: string, userId: string, messageId: string): Promise<boolean> {
    const { error } = await this.client
      .from('conversation_members')
      .update({ last_read_message_id: messageId })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
    if (error) throw new Error(`markConversationAsRead failed: ${error.message}`);
    return true;
  }

  // --- MESSAGES ---
  async getMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`getMessages failed: ${error.message}`);
    return (data ?? []).map(mapMessageRow);
  }

  async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type?: 'TEXT' | 'FILE' | 'IMAGE';
    reply_to?: string;
    attachments?: Partial<Attachment>[];
  }): Promise<Message> {
    const { data: row, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        content: data.content,
        message_type: data.message_type ?? 'TEXT',
        reply_to: data.reply_to,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw new Error(`sendMessage failed: ${error.message}`);

    if (data.attachments && data.attachments.length > 0) {
      await this.client.from('attachments').insert(
        data.attachments.map(att => ({
          message_id: row.id,
          file_name: att.file_name,
          file_path: att.file_path,
          mime_type: att.mime_type,
          size: att.size,
        }))
      );
    }

    return mapMessageRow(row);
  }

  async editMessage(messageId: string, newContent: string): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .update({ content: newContent, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select(MESSAGE_SELECT)
      .single();
    if (error) throw new Error(`editMessage failed: ${error.message}`);
    return mapMessageRow(data);
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const { error } = await this.client
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), content: 'Сообщение удалено' })
      .eq('id', messageId);
    if (error) throw new Error(`deleteMessage failed: ${error.message}`);
    return true;
  }

  async addReaction(messageId: string, userId: string, reaction: string): Promise<MessageReaction> {
    const { data, error } = await this.client
      .from('message_reactions')
      .upsert({ message_id: messageId, user_id: userId, reaction }, { onConflict: 'message_id,user_id,reaction' })
      .select('*, profiles(first_name, last_name)')
      .single();
    if (error) throw new Error(`addReaction failed: ${error.message}`);
    return {
      id: data.id,
      message_id: data.message_id,
      user_id: data.user_id,
      user_name: data.profiles ? `${data.profiles.first_name} ${data.profiles.last_name}` : undefined,
      reaction: data.reaction,
      created_at: data.created_at,
    };
  }

  async removeReaction(messageId: string, userId: string, reaction: string): Promise<boolean> {
    const { error } = await this.client
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('reaction', reaction);
    if (error) throw new Error(`removeReaction failed: ${error.message}`);
    return true;
  }

  subscribeToMessages(conversationId: string, callback: (message: Message) => void): () => void {
    const channel = this.client
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload: any) => {
          const full = await this.getMessages(conversationId);
          const inserted = full.find(m => m.id === payload.new.id);
          if (inserted) callback(inserted);
        }
      )
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: PASS (6 tests total)

Run: `npm run build`
Expected: succeeds (type-checks the new code even though nothing references it yet).

- [ ] **Step 5: Commit**

```bash
git add lib/provider/supabase-provider.ts lib/provider/supabase-provider.test.ts
git commit -m "feat: SupabaseDataProvider — conversations, messages, reactions, realtime"
```

---

### Task 10: `SupabaseDataProvider` — Branding (+ realtime broadcast)

**Files:**
- Modify: `lib/provider/supabase-provider.ts`
- Modify: `lib/provider/supabase-provider.test.ts`

**Interfaces:**
- Produces (added to class): `getBranding`, `updateBranding`, `subscribeToBranding`.

- [ ] **Step 1: Add failing test**

```ts
describe('SupabaseDataProvider.updateBranding', () => {
  beforeEach(() => from.mockReset());

  it('updates the single branding_config row (id = 1) and broadcasts the change', async () => {
    const updatedRow = { id: 1, company_name: 'New Co', app_title: 'X', logo_url: '', logo_small_url: '',
      favicon_url: '', primary_color: '#000', secondary_color: '#111', background_color: '#222',
      login_background: '', updated_at: '2026-08-10T00:00:00Z' };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });

    const send = vi.fn().mockResolvedValue(undefined);
    const channel = { send, subscribe: vi.fn().mockReturnThis() };
    const channelFn = vi.fn().mockReturnValue(channel);

    const provider = new SupabaseDataProvider();
    (provider as any).client.channel = channelFn;

    const result = await provider.updateBranding({ company_name: 'New Co' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ company_name: 'New Co' }));
    expect(eq).toHaveBeenCalledWith('id', 1);
    expect(result.company_name).toBe('New Co');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: FAIL — `updateBranding` is not a function.

- [ ] **Step 3: Implement**

```ts
  // --- BRANDING ---
  async getBranding(): Promise<BrandingConfig> {
    const { data, error } = await this.client.from('branding_config').select('*').eq('id', 1).single();
    if (error) throw new Error(`getBranding failed: ${error.message}`);
    return mapBrandingRow(data);
  }

  async updateBranding(config: Partial<BrandingConfig>): Promise<BrandingConfig> {
    const { data, error } = await this.client
      .from('branding_config')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw new Error(`updateBranding failed: ${error.message}`);
    const branding = mapBrandingRow(data);

    this.client.channel('branding-updates').send({
      type: 'broadcast',
      event: 'branding_changed',
      payload: branding,
    });

    return branding;
  }

  subscribeToBranding(callback: (branding: BrandingConfig) => void): () => void {
    const channel = this.client
      .channel('branding-updates')
      .on('broadcast', { event: 'branding_changed' }, (payload: any) => callback(payload.payload))
      .subscribe();
    return () => {
      this.client.removeChannel(channel);
    };
  }
```

Add the mapping helper near the other `map*Row` functions:

```ts
function mapBrandingRow(row: any): BrandingConfig {
  return {
    company_name: row.company_name,
    app_title: row.app_title,
    logo_url: row.logo_url ?? '',
    logo_small_url: row.logo_small_url ?? '',
    favicon_url: row.favicon_url ?? '',
    primary_color: row.primary_color,
    secondary_color: row.secondary_color,
    background_color: row.background_color,
    login_background: row.login_background,
    updated_at: row.updated_at,
  };
}
```

Add `BrandingConfig` to the `@/types` import at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: PASS (7 tests total)

- [ ] **Step 5: Commit**

```bash
git add lib/provider/supabase-provider.ts lib/provider/supabase-provider.test.ts
git commit -m "feat: SupabaseDataProvider — branding with realtime broadcast"
```

---

### Task 11: `SupabaseDataProvider` — Audit Logs + real client-IP capture

The mock provider hardcodes `ip: '127.0.0.1'` because a browser genuinely cannot read the caller's own public IP. This needs one small server-side piece.

**Files:**
- Modify: `lib/provider/supabase-provider.ts`
- Create: `app/api/audit-ip/route.ts`
- Test: `app/api/audit-ip/route.test.ts`

**Interfaces:**
- Produces (added to class): `getAuditLogs`, `logAudit` (calls `GET /api/audit-ip` internally to get the real IP before inserting).
- Produces: `GET /api/audit-ip` → `{ ip: string }`.

- [ ] **Step 1: Write the failing test for the API route**

```ts
// app/api/audit-ip/route.test.ts
import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/audit-ip', () => {
  it('returns the IP from the x-forwarded-for header', async () => {
    const req = new Request('http://localhost/api/audit-ip', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.ip).toBe('203.0.113.9');
  });

  it('falls back to "unknown" with no forwarding header', async () => {
    const req = new Request('http://localhost/api/audit-ip');
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.ip).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/api/audit-ip/route.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the route**

```ts
// app/api/audit-ip/route.ts
export async function GET(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  return Response.json({ ip });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/api/audit-ip/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add audit methods to `SupabaseDataProvider`**

```ts
  // --- AUDIT LOGS ---
  async getAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await this.client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`getAuditLogs failed: ${error.message}`);
    return (data ?? []).map(mapAuditRow);
  }

  async logAudit(data: {
    user_id: string;
    user_email: string;
    action: string;
    target_type: string;
    target_id?: string;
    metadata?: Record<string, any>;
  }): Promise<AuditLog> {
    let ip = '127.0.0.1';
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/audit-ip');
        const body = await res.json();
        ip = body.ip;
      } catch {
        // Best-effort — an unreachable IP endpoint shouldn't block the audited action.
      }
    }

    const { data: row, error } = await this.client
      .from('audit_logs')
      .insert({ ...data, ip })
      .select()
      .single();
    if (error) throw new Error(`logAudit failed: ${error.message}`);
    return mapAuditRow(row);
  }
```

Add the mapping helper:

```ts
function mapAuditRow(row: any): AuditLog {
  return {
    id: row.id,
    user_id: row.user_id,
    user_email: row.user_email,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id ?? undefined,
    metadata: row.metadata ?? {},
    ip: row.ip,
    created_at: row.created_at,
  };
}
```

Add `AuditLog` to the `@/types` import.

- [ ] **Step 6: Run the full test file and build**

Run: `npm run test -- lib/provider/supabase-provider.test.ts app/api/audit-ip/route.test.ts`
Expected: all PASS.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/provider/supabase-provider.ts app/api/audit-ip/route.ts app/api/audit-ip/route.test.ts
git commit -m "feat: SupabaseDataProvider audit logs + real client-IP capture route"
```

---

### Task 12: `SupabaseDataProvider` — Telegram account passthrough (interim)

Full bot-relay logic ships in the Telegram plan (Plan 5). This task only makes the existing `IDataProvider` Telegram methods real where the real table already supports them (`telegram_accounts`), and honest placeholders elsewhere — not fake data.

**Files:**
- Modify: `lib/provider/supabase-provider.ts`
- Modify: `lib/provider/supabase-provider.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe('SupabaseDataProvider.getTelegramAccount', () => {
  beforeEach(() => from.mockReset());

  it('returns a disconnected account when no row exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    const provider = new SupabaseDataProvider();
    const account = await provider.getTelegramAccount('u1');
    expect(account.connected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: FAIL — `getTelegramAccount` is not a function.

- [ ] **Step 3: Implement**

```ts
  // --- TELEGRAM (interim — full relay lands in the Telegram integration plan) ---
  async getTelegramAccount(userId: string): Promise<TelegramAccount> {
    const { data, error } = await this.client
      .from('telegram_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`getTelegramAccount failed: ${error.message}`);
    if (!data) {
      return { user_id: userId, connected: false, session_encrypted: false, last_sync: new Date().toISOString() };
    }
    return {
      user_id: data.user_id,
      connected: data.connected,
      telegram_user_id: data.telegram_user_id ?? undefined,
      username: data.username ?? undefined,
      phone: data.phone ?? undefined,
      session_encrypted: !!data.session_encrypted,
      last_sync: data.last_sync,
    };
  }

  async connectTelegram(_userId: string, _phone: string): Promise<TelegramAccount> {
    throw new Error(
      'connectTelegram: phone-based connect is replaced by the bot deep-link flow — see the Telegram integration plan.'
    );
  }

  async disconnectTelegram(userId: string): Promise<boolean> {
    const { error } = await this.client.from('telegram_accounts').delete().eq('user_id', userId);
    if (error) throw new Error(`disconnectTelegram failed: ${error.message}`);
    return true;
  }

  async getTelegramChats(_userId: string): Promise<TelegramChat[]> {
    // The "separate Telegram inbox" UI concept goes away with the bot-relay design —
    // relayed messages appear as normal Centras Chat messages instead. See Plan 5.
    return [];
  }

  async getTelegramMessages(_userId: string, _chatId: string): Promise<TelegramMessage[]> {
    return [];
  }

  async sendTelegramMessage(_userId: string, _chatId: string, _content: string): Promise<TelegramMessage> {
    throw new Error('sendTelegramMessage: not available until the Telegram bot-relay plan ships.');
  }
```

Add `TelegramAccount, TelegramChat, TelegramMessage` to the `@/types` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/supabase-provider.test.ts`
Expected: PASS (8 tests total)

- [ ] **Step 5: Verify `SupabaseDataProvider` fully satisfies `IDataProvider`**

Add `implements IDataProvider` to the class declaration and `import type { IDataProvider } from './data-provider';`:

```ts
export class SupabaseDataProvider implements IDataProvider {
```

Run: `npm run build`
Expected: succeeds with no type errors — this is the compiler's confirmation that every method of the interface is now implemented with matching signatures.

- [ ] **Step 6: Commit**

```bash
git add lib/provider/supabase-provider.ts lib/provider/supabase-provider.test.ts
git commit -m "feat: SupabaseDataProvider — telegram passthrough, now fully implements IDataProvider"
```

---

### Task 13: `getDataProvider()` factory + wire all services to it

**Files:**
- Modify: `lib/provider/index.ts`
- Modify: `lib/provider/index.test.ts`
- Modify: `services/chat-service.ts`, `services/user-service.ts`, `services/group-service.ts`, `services/branding-service.ts`, `services/telegram-service.ts`
- Modify: `components/admin/users-table.tsx` (createUser call site — see note below)

**Interfaces:**
- Produces: `getDataProvider(): IDataProvider`, added to `lib/provider/index.ts` alongside `resolveProviderMode`.

- [ ] **Step 1: Add failing test**

Append to `lib/provider/index.test.ts`:

```ts
describe('getDataProvider', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('returns the mock provider singleton when no env vars are set', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { getDataProvider } = await import('./index');
    const { globalDataProvider } = await import('./mock-provider');
    expect(getDataProvider()).toBe(globalDataProvider);
  });

  it('returns a SupabaseDataProvider instance when both env vars are set', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    const { getDataProvider } = await import('./index');
    const { SupabaseDataProvider } = await import('./supabase-provider');
    expect(getDataProvider()).toBeInstanceOf(SupabaseDataProvider);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/provider/index.test.ts`
Expected: FAIL — `getDataProvider` is not exported.

- [ ] **Step 3: Implement**

```ts
// lib/provider/index.ts (append below resolveProviderMode)
import type { IDataProvider } from './data-provider';
import { globalDataProvider } from './mock-provider';
import { SupabaseDataProvider } from './supabase-provider';

let cachedProvider: IDataProvider | null = null;

export function getDataProvider(): IDataProvider {
  if (!cachedProvider) {
    const mode = resolveProviderMode(process.env as Record<string, string | undefined>);
    cachedProvider = mode === 'supabase' ? new SupabaseDataProvider() : globalDataProvider;
  }
  return cachedProvider;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/provider/index.test.ts`
Expected: PASS (4 tests total)

- [ ] **Step 5: Rewire every service**

In each of `services/chat-service.ts`, `services/user-service.ts`, `services/group-service.ts`, `services/branding-service.ts`, `services/telegram-service.ts`: replace

```ts
import { globalDataProvider } from '@/lib/provider/mock-provider';
```

with

```ts
import { getDataProvider } from '@/lib/provider';
```

and replace every call site `globalDataProvider.xyz(...)` with `getDataProvider().xyz(...)`. (Mechanical, one-for-one rename — the method names and signatures are unchanged.)

- [ ] **Step 6: Fix the one call site broken by Task 8's `createUser` change**

`components/admin/users-table.tsx` calls `UserService.createUser(...)` for the "add employee" admin action. In Supabase mode this now throws by design (Task 8). Find that call site and wrap it:

```tsx
const handleCreateUser = async (userData: Partial<User>) => {
  try {
    const newUser = await UserService.createUser(userData);
    setUsers(prev => [...prev, newUser]);
  } catch (err: any) {
    // In Supabase mode, admin user creation goes through Supabase Auth invite/signup
    // instead of a direct profile insert — full admin-invite flow is a follow-up,
    // not silently swallowed here.
    alert(err.message);
  }
};
```

(Exact surrounding code depends on the current handler name in that file — apply the same try/catch shape around whatever the existing create-user submit handler is.)

- [ ] **Step 7: Run everything**

Run: `npm run test`
Expected: all tests PASS.

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`, click through: login (mock), send a chat message, react to a message, open admin → branding → change primary color (live-updates), open Settings → save. Expected: identical behavior to before this task — mode is still `mock` because no env vars are set locally yet.

- [ ] **Step 8: Commit**

```bash
git add lib/provider/index.ts lib/provider/index.test.ts services/*.ts components/admin/users-table.tsx
git commit -m "feat: getDataProvider factory; wire all services to it"
```

---

### Task 14: Seed script for a real Supabase project

**Files:**
- Create: `scripts/seed-supabase.ts`
- Modify: `package.json`

- [ ] **Step 1: Install a TS script runner**

Run: `npm install -D tsx`

- [ ] **Step 2: Write the seed script**

```ts
// scripts/seed-supabase.ts
// Run with: npm run seed:supabase
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const DEMO_USERS = [
  { email: 'admin@demo.local', password: 'password123', first_name: 'Администратор', last_name: 'Системный', role: 'SUPER_ADMIN', department: 'IT', position: 'CTO / Системный Администратор' },
  { email: 'employee1@demo.local', password: 'password123', first_name: 'Иван', last_name: 'Петров', role: 'EMPLOYEE', department: 'AI', position: 'Senior AI Engineer' },
  { email: 'employee2@demo.local', password: 'password123', first_name: 'Анна', last_name: 'Иванова', role: 'ADMIN', department: 'HR', position: 'HR Lead' },
];

const DEMO_DEPARTMENTS = [
  { name: 'IT', description: 'Департамент информационных технологий' },
  { name: 'AI', description: 'Лаборатория искусственного интеллекта' },
  { name: 'HR', description: 'Управление персоналом' },
  { name: 'Management', description: 'Руководство компании' },
];

async function main() {
  console.log('Seeding departments...');
  const deptIdByName = new Map<string, string>();
  for (const dept of DEMO_DEPARTMENTS) {
    const { data, error } = await supabase.from('departments').upsert(dept, { onConflict: 'name' }).select().single();
    if (error) throw error;
    deptIdByName.set(dept.name, data.id);
  }

  console.log('Seeding demo users via Supabase Auth...');
  for (const demoUser of DEMO_USERS) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: demoUser.email,
      password: demoUser.password,
      email_confirm: true,
      user_metadata: { first_name: demoUser.first_name, last_name: demoUser.last_name, role: demoUser.role },
    });
    if (error && !error.message.includes('already been registered')) throw error;
    if (!created?.user) {
      console.log(`  ${demoUser.email} already exists, skipping profile patch.`);
      continue;
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ position: demoUser.position, department_id: deptIdByName.get(demoUser.department), role: demoUser.role })
      .eq('id', created.user.id);
    if (profileError) throw profileError;
    console.log(`  created ${demoUser.email}`);
  }

  console.log('Seeding branding config...');
  const { error: brandingError } = await supabase
    .from('branding_config')
    .upsert({ id: 1, company_name: 'Centras Chat', app_title: 'Corporate Messenger' }, { onConflict: 'id' });
  if (brandingError) throw brandingError;

  console.log('Done. Log in with admin@demo.local / password123');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

In `package.json`, inside `"scripts"`:

```json
"seed:supabase": "tsx scripts/seed-supabase.ts"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-supabase.ts package.json package-lock.json
git commit -m "feat: add Supabase demo-data seed script"
```

(This script's actual run against a live project happens in Task 15/16, once a real project exists.)

---

### Task 15: `docs/SUPABASE_SETUP.md`

**Files:**
- Create: `docs/SUPABASE_SETUP.md`

- [ ] **Step 1: Write the guide**

```markdown
# Real Supabase Backend Setup

By default Centras Chat runs against a built-in mock backend — no setup needed.
Follow this guide to switch it to a real, persistent Supabase backend.

## 1. Create a project

Go to https://supabase.com/dashboard → New project. Free tier is enough to start.
Note the project's **URL**, **anon public key**, and **service_role key** (Project Settings → API).

## 2. Run the migrations

Project → SQL Editor → New query. Paste and run, in this exact order:

1. The full contents of `supabase/migrations/001_initial_schema.sql`
2. The full contents of `supabase/migrations/002_auth_and_rls.sql`

## 3. Enable email auth

Authentication → Providers → Email → make sure it's enabled (it is by default).
Authentication → Settings → turn **off** "Confirm email" for local testing, so seeded/demo accounts can sign in immediately without clicking an email link. Turn it back on before real production use.

## 4. Set your environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=<your project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
```

Restart `npm run dev` after editing this file — Next.js only reads it on startup.

## 5. Seed demo data

```bash
npm run seed:supabase
```

Creates the same three demo accounts the mock provider ships with (`admin@demo.local`, `employee1@demo.local`, `employee2@demo.local`, all with password `password123`), plus departments and branding defaults.

## 6. Verify

`npm run dev`, log in as `admin@demo.local` / `password123`. You should see the seeded departments in Admin → Users, and messages you send should still be there after a full page refresh (proof it's really persisted, not the in-memory mock).

## Known limitations at this stage

- Admin "create user" in the UI is not yet wired to Supabase Auth invite flow (throws with a clear message) — creating additional real users currently requires the seed script or the Supabase dashboard directly. This is called out as a follow-up, not a hidden gap.
- File upload/download, audio/video calls, and the real Telegram integration are separate plans layered on top of this one — this guide only covers the backend foundation (auth, data, realtime).
```

- [ ] **Step 2: Commit**

```bash
git add docs/SUPABASE_SETUP.md
git commit -m "docs: add real Supabase backend setup guide"
```

---

### Task 16: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

Run: `npm run test`
Expected: every test from Tasks 1–13 PASSes.

Run: `npm run lint`
Expected: no errors (warnings acceptable if they pre-exist and are unrelated to this plan's changes — do not introduce new ones).

Run: `npm run build`
Expected: succeeds, 16/16 routes compile (matches the baseline noted in `PROJECT.md`) plus the new `app/api/audit-ip` route.

- [ ] **Step 2: Manual regression pass — mock mode (no env vars set)**

Run `npm run dev` and click through:
- Login via each of the three quick-select buttons.
- Send a message, edit it, delete it, add a reaction, reply to it.
- Admin → Users: view list. Admin → Departments: view list. Admin → Branding: change primary color, confirm it live-updates the sidebar accent immediately. Admin → Audit: confirm the branding change appears as a new entry.
- Settings page: toggle a notification checkbox, click Save.
- Logout, confirm redirect to `/login`.

Expected: identical to pre-plan behavior — this plan must not regress the zero-config demo path.

- [ ] **Step 3: Manual pass — real Supabase mode (only if you provide project credentials)**

If `.env.local` is filled in per `docs/SUPABASE_SETUP.md` and `npm run seed:supabase` has been run:
- Login as `admin@demo.local` / `password123` — this now actually checks the password (try a wrong one first, confirm it's rejected).
- Send a message, refresh the page, confirm it's still there (real persistence).
- Open the same conversation in two browser windows logged in as two different seeded users, send a message in one, confirm it appears in the other without a refresh (real Realtime).
- Admin → Branding: change a color, confirm the other browser window updates live too (broadcast channel working).

If no credentials are available in this session, this step is explicitly marked **not run** in the final report rather than assumed to pass.

- [ ] **Step 4: Update `PROJECT.md`**

Add a row to the Task Log table and update the Decisions Log / Known Issues sections to reflect that a real Supabase provider now exists alongside the mock, per the existing table format in that file.

- [ ] **Step 5: Final commit**

```bash
git add PROJECT.md
git commit -m "docs: update PROJECT.md for backend foundation completion"
```
