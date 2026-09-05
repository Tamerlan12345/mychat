import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, type AppDeps } from './app';
import { loadConfig } from './config';

const baseEnv = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  INTEGRATION_BOT_TOKEN: 'bot-secret-token',
  INTEGRATION_BOT_USER_ID: '00000000-0000-0000-0000-00000000b0b0',
  OUTBOX_WEBHOOK_URL: 'https://hooks.example.com/centras',
  OUTBOX_WEBHOOK_SECRET: 'whsec',
};

function makeAdmin(overrides: Partial<Record<string, any>> = {}) {
  const single = vi.fn().mockResolvedValue({ data: { id: 'm1', created_at: '2026-09-06T10:00:00Z' }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const limit = vi.fn().mockResolvedValue({ data: [{ id: 'e1', event_type: 'message.created', status: 'pending' }], error: null });
  const eqStatus = vi.fn().mockResolvedValue({ data: [{ id: 'e2', event_type: 'message.created', status: 'dead' }], error: null });
  const order = vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue(Object.assign(Promise.resolve({ data: [{ id: 'e1', event_type: 'message.created', status: 'pending' }], error: null }), { eq: eqStatus })) });
  const outboxSelect = vi.fn().mockReturnValue({ order });
  const profileMaybeSingle = vi.fn().mockResolvedValue({ data: { role: overrides.role ?? 'ADMIN' }, error: null });
  const profileEq = vi.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
  const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });
  const from = vi.fn((table: string) => {
    if (table === 'messages') return { insert };
    if (table === 'integration_outbox') return { select: outboxSelect };
    if (table === 'profiles') return { select: profileSelect };
    throw new Error(`unexpected table ${table}`);
  });
  const getUser = vi.fn().mockResolvedValue(
    overrides.invalidToken ? { data: { user: null }, error: { message: 'bad' } } : { data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }
  );
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { admin: { from, rpc, auth: { getUser } } as any, insert, limit, rpc, getUser };
}

function makeApp(deps: Partial<AppDeps> = {}, env = baseEnv) {
  const config = loadConfig({ ...env } as any);
  const proxy = vi.fn(async (req: Request) => Response.json({ proxied: new URL(req.url).pathname }));
  const { admin, insert, rpc } = makeAdmin(deps as any);
  const app = createApp({ config, admin, proxy, telegramConfigured: false, ...deps });
  return { app, proxy, insert, rpc, config };
}

describe('gateway app', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('answers /healthz and /api/v1/bootstrap without exposing keys', async () => {
    const { app } = makeApp();
    const health = await app.request('/healthz');
    expect(health.status).toBe(200);

    const res = await app.request('/api/v1/bootstrap');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.product).toBe('Centras Chat');
    expect(body.features).toEqual({ telegram: false, integrationBot: true, outboxWebhook: true });
    expect(JSON.stringify(body)).not.toContain('anon-key');
    expect(JSON.stringify(body)).not.toContain('service-key');
  });

  it('reports degraded readiness when the upstream probe fails', async () => {
    const { app } = makeApp({ readiness: async () => false });
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
  });

  it('forwards Supabase paths to the proxy handler', async () => {
    const { app, proxy } = makeApp();
    const res = await app.request('/rest/v1/messages?select=*', { method: 'GET', headers: { authorization: 'Bearer user-jwt' } });
    expect(res.status).toBe(200);
    expect(proxy).toHaveBeenCalledTimes(1);
    expect((await res.json()).proxied).toBe('/rest/v1/messages');
    const auth = await app.request('/auth/v1/token?grant_type=password', { method: 'POST', body: '{}' });
    expect(auth.status).toBe(200);
    expect(proxy).toHaveBeenCalledTimes(2);
  });

  describe('integration bot', () => {
    it('rejects missing or wrong bot token', async () => {
      const { app } = makeApp();
      expect((await app.request('/api/v1/integrations/messages', { method: 'POST', body: '{}' })).status).toBe(401);
      const wrong = await app.request('/api/v1/integrations/messages', {
        method: 'POST',
        headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
        body: JSON.stringify({ conversation_id: 'c1', content: 'hi' }),
      });
      expect(wrong.status).toBe(401);
    });

    it('validates the body and inserts as the bot user', async () => {
      const { app, insert } = makeApp();
      const headers = { authorization: 'Bearer bot-secret-token', 'content-type': 'application/json' };
      const bad = await app.request('/api/v1/integrations/messages', { method: 'POST', headers, body: JSON.stringify({ content: '' }) });
      expect(bad.status).toBe(400);

      const ok = await app.request('/api/v1/integrations/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversation_id: 'c1', content: 'Заявка №42 согласована' }),
      });
      expect(ok.status).toBe(201);
      expect(insert).toHaveBeenCalledWith({
        conversation_id: 'c1',
        sender_id: baseEnv.INTEGRATION_BOT_USER_ID,
        content: 'Заявка №42 согласована',
        message_type: 'TEXT',
      });
    });

    it('returns 503 when the bot is not configured', async () => {
      const { app } = makeApp({}, { ...baseEnv, INTEGRATION_BOT_TOKEN: '', INTEGRATION_BOT_USER_ID: '' });
      const res = await app.request('/api/v1/integrations/messages', { method: 'POST', body: '{}' });
      expect(res.status).toBe(503);
    });
  });

  describe('admin outbox', () => {
    it('requires a valid user token', async () => {
      const { app } = makeApp();
      expect((await app.request('/api/v1/admin/outbox')).status).toBe(401);
    });

    it('rejects non-admins and serves admins', async () => {
      const employee = makeAdmin({ role: 'EMPLOYEE' });
      const forbidden = createApp({ config: loadConfig({ ...baseEnv } as any), admin: employee.admin, proxy: async () => new Response() });
      expect((await forbidden.request('/api/v1/admin/outbox', { headers: { authorization: 'Bearer jwt' } })).status).toBe(403);

      const { app, rpc } = makeApp();
      const res = await app.request('/api/v1/admin/outbox', { headers: { authorization: 'Bearer jwt' } });
      expect(res.status).toBe(200);
      expect((await res.json()).items[0].event_type).toBe('message.created');

      const retry = await app.request('/api/v1/admin/outbox/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f/retry', {
        method: 'POST',
        headers: { authorization: 'Bearer jwt' },
      });
      expect(retry.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('retry_outbox', { p_id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' });
    });
  });

  it('mounts Telegram handlers when provided', async () => {
    const webhook = vi.fn(async () => new Response(null, { status: 200 }));
    const { app } = makeApp({
      telegram: { webhook, worker: webhook, accountCreate: webhook, accountDelete: webhook },
      telegramConfigured: true,
    });
    const res = await app.request('/api/telegram/webhook', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(webhook).toHaveBeenCalledTimes(1);
    expect((await (await app.request('/api/v1/bootstrap')).json()).features.telegram).toBe(true);
  });
});

describe('loadConfig', () => {
  it('requires the Supabase trio and a secret whenever a webhook URL is set', () => {
    expect(() => loadConfig({} as any)).toThrow(/SUPABASE_URL/);
    expect(() => loadConfig({ ...baseEnv, OUTBOX_WEBHOOK_SECRET: '' } as any)).toThrow(/OUTBOX_WEBHOOK_SECRET/);
    const cfg = loadConfig({ ...baseEnv, GATEWAY_PORT: '9000', CORS_ORIGINS: 'https://a.example, https://b.example' } as any);
    expect(cfg.port).toBe(9000);
    expect(cfg.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });
});
