import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GatewayConfig } from './config';
import { bearerToken, isAdminRole, secretMatches, verifyUser } from './auth';

type Handler = (req: Request) => Promise<Response>;

export interface TelegramHandlers {
  webhook: Handler;
  worker: Handler;
  accountCreate: Handler;
  accountDelete: Handler;
}

export interface AppDeps {
  config: GatewayConfig;
  admin: SupabaseClient;
  /** Forwards a request to Supabase with the real keys injected. */
  proxy: Handler;
  telegram?: TelegramHandlers;
  telegramConfigured?: boolean;
  /** Upstream health probe for /readyz. */
  readiness?: () => Promise<boolean>;
}

const PROXIED_PREFIXES = ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1', '/graphql/v1'];
const MAX_MESSAGE_LENGTH = 4000;

export function createApp(deps: AppDeps) {
  const { config, admin } = deps;
  const app = new Hono();

  // Supabase answers CORS for the proxied paths itself; the gateway's own API needs its own headers.
  const corsMiddleware = cors({
    origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });
  app.use('/api/*', corsMiddleware);
  app.use('/healthz', corsMiddleware);
  app.use('/readyz', corsMiddleware);

  app.get('/healthz', c => c.json({ status: 'ok', version: config.version, time: new Date().toISOString() }));

  app.get('/readyz', async c => {
    const ok = deps.readiness ? await deps.readiness() : true;
    return c.json({ status: ok ? 'ready' : 'degraded', upstream: ok ? 'reachable' : 'unreachable' }, ok ? 200 : 503);
  });

  /** Everything a client needs to start — and nothing it should not have (no keys). */
  app.get('/api/v1/bootstrap', c =>
    c.json({
      product: 'Centras Chat',
      version: config.version,
      minClientVersion: config.minClientVersion,
      features: {
        telegram: Boolean(deps.telegram && deps.telegramConfigured),
        integrationBot: Boolean(config.integrationBotToken && config.integrationBotUserId),
        outboxWebhook: Boolean(config.outboxWebhookUrl),
      },
      serverTime: new Date().toISOString(),
    })
  );

  // --- Integration bot: external systems post into a conversation ---------------------------
  app.post('/api/v1/integrations/messages', async c => {
    if (!config.integrationBotToken || !config.integrationBotUserId) {
      return c.json({ error: 'Интеграционный бот не настроен' }, 503);
    }
    if (!secretMatches(bearerToken(c.req.raw), config.integrationBotToken)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Тело запроса должно быть JSON' }, 400);
    }
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id.trim() : '';
    const content = typeof body?.content === 'string' ? body.content.trim() : '';
    if (!conversationId || !content) return c.json({ error: 'Нужны conversation_id и content' }, 400);
    if (content.length > MAX_MESSAGE_LENGTH) return c.json({ error: `content длиннее ${MAX_MESSAGE_LENGTH} символов` }, 400);

    const { data, error } = await admin
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: config.integrationBotUserId, content, message_type: 'TEXT' })
      .select('id, created_at')
      .single();
    if (error) {
      console.error('[integrations] insert failed:', error.message);
      return c.json({ error: 'Не удалось сохранить сообщение' }, 502);
    }
    return c.json({ id: (data as any).id, created_at: (data as any).created_at }, 201);
  });

  // --- Admin: outbox visibility and manual retry -----------------------------------------------
  const requireAdmin = async (req: Request) => {
    const user = await verifyUser(admin, bearerToken(req));
    if (!user) return { status: 401 as const, error: 'Unauthorized' };
    if (!isAdminRole(user.role)) return { status: 403 as const, error: 'Forbidden' };
    return { status: 200 as const, user };
  };

  app.get('/api/v1/admin/outbox', async c => {
    const gate = await requireAdmin(c.req.raw);
    if (gate.status !== 200) return c.json({ error: gate.error }, gate.status);
    const status = c.req.query('status');
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
    let query = admin
      .from('integration_outbox')
      .select('id, event_type, status, attempts, max_attempts, next_attempt_at, last_error, created_at, delivered_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status && ['pending', 'leased', 'delivered', 'dead'].includes(status)) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return c.json({ error: 'Не удалось прочитать очередь' }, 502);
    return c.json({ items: data ?? [] });
  });

  app.post('/api/v1/admin/outbox/:id/retry', async c => {
    const gate = await requireAdmin(c.req.raw);
    if (gate.status !== 200) return c.json({ error: gate.error }, gate.status);
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'Некорректный id' }, 400);
    const { error } = await admin.rpc('retry_outbox', { p_id: id });
    if (error) return c.json({ error: 'Не удалось перепоставить событие' }, 502);
    return c.json({ ok: true });
  });

  // --- Telegram relay (same handlers as the Next.js routes; scheduler lives in index.ts) -------
  if (deps.telegram) {
    const t = deps.telegram;
    app.post('/api/telegram/webhook', c => t.webhook(c.req.raw));
    app.post('/api/telegram/worker', c => t.worker(c.req.raw));
    app.post('/api/telegram/account', c => t.accountCreate(c.req.raw));
    app.delete('/api/telegram/account', c => t.accountDelete(c.req.raw));
  }

  // --- Transparent Supabase proxy ---------------------------------------------------------------
  for (const prefix of PROXIED_PREFIXES) {
    app.all(prefix, c => deps.proxy(c.req.raw));
    app.all(`${prefix}/*`, c => deps.proxy(c.req.raw));
  }

  app.notFound(c => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    console.error('[gateway] unhandled error:', err);
    return c.json({ error: 'Внутренняя ошибка сервера' }, 500);
  });

  return app;
}

export type GatewayApp = ReturnType<typeof createApp>;
