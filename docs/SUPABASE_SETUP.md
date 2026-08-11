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

Creates the same four demo accounts the mock provider ships with (`admin@demo.local`, `employee1@demo.local`, `employee2@demo.local`, `employee3@demo.local`, all with password `password123`), plus departments and branding defaults.

## 6. Verify

`npm run dev`, log in as `admin@demo.local` / `password123`. You should see the seeded departments in Admin → Users, and messages you send should still be there after a full page refresh (proof it's really persisted, not the in-memory mock).

## Known limitations at this stage

- Admin "create user" in the UI is not yet wired to Supabase Auth invite flow (throws with a clear message) — creating additional real users currently requires the seed script or the Supabase dashboard directly. This is called out as a follow-up, not a hidden gap.
- File upload/download, audio/video calls, and the real Telegram integration are separate plans layered on top of this one — this guide only covers the backend foundation (auth, data, realtime).
- Admin audit log page (`/admin/audit`) still reads mock data instead of Supabase-backed audit logs — pending a follow-up `AuditService` integration.
