import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config';
import { createApp, type TelegramHandlers } from './app';
import { createProxyHandler } from './proxy';
import { attachRealtimeProxy } from './ws-proxy';
import { OutboxDispatcher, createSupabaseOutboxStore } from './outbox/dispatcher';
import { createWebhookConnector } from './outbox/webhook';
import { POST as telegramWebhook } from '@/app/api/telegram/webhook/route';
import { POST as telegramWorker } from '@/app/api/telegram/worker/route';
import { POST as telegramAccountCreate, DELETE as telegramAccountDelete } from '@/app/api/telegram/account/route';
import { getTelegramConfig, type TelegramRetryConfig } from '@/lib/telegram/config';
import { processTelegramOutbox } from '@/lib/telegram/outbox-worker';

const config = loadConfig();

const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let telegramRetry: TelegramRetryConfig | null = null;
try {
  telegramRetry = getTelegramConfig().retry;
} catch {
  console.log('[telegram] relay not configured (TELEGRAM_* variables missing) — routes will answer 503');
}

const telegram: TelegramHandlers = {
  webhook: telegramWebhook,
  worker: telegramWorker,
  accountCreate: telegramAccountCreate,
  accountDelete: telegramAccountDelete,
};

const app = createApp({
  config,
  admin,
  proxy: createProxyHandler({ upstream: config.supabaseUrl, anonKey: config.supabaseAnonKey }),
  telegram,
  telegramConfigured: telegramRetry !== null,
  readiness: async () => {
    try {
      const res = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: config.supabaseAnonKey },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, info => {
  console.log(`[gateway] Centras Chat gateway ${config.version} listening on http://${info.address}:${info.port}`);
  console.log(`[gateway] upstream ${config.supabaseUrl}`);
}) as unknown as Server;

attachRealtimeProxy(server, { upstream: config.supabaseUrl, anonKey: config.supabaseAnonKey });

// --- integration_outbox → connectors ---------------------------------------------------------
const connectors = [];
if (config.outboxWebhookUrl && config.outboxWebhookSecret) {
  connectors.push(createWebhookConnector({ url: config.outboxWebhookUrl, secret: config.outboxWebhookSecret }));
}
const dispatcher = new OutboxDispatcher(createSupabaseOutboxStore(admin), connectors, {
  pollMs: config.outboxPollMs,
  batchSize: config.outboxBatchSize,
});
if (dispatcher.hasConnectors) {
  dispatcher.start();
  console.log(`[outbox] dispatching to ${connectors.map(c => c.name).join(', ')} every ${config.outboxPollMs} ms`);
} else {
  console.log('[outbox] no connectors configured (OUTBOX_WEBHOOK_URL unset) — events stay queued for inspection');
}

const dailyCleanup = setInterval(() => {
  admin
    .rpc('cleanup_outbox', { p_keep_days: 14 })
    .then(({ data, error }) => {
      if (error) console.warn('[outbox] cleanup failed:', error.message);
      else if (typeof data === 'number' && data > 0) console.log(`[outbox] cleanup removed ${data} rows`);
    });
}, 24 * 60 * 60 * 1000);

// --- Telegram outbox worker (replaces the external cron that used to call /api/telegram/worker) --
let telegramTimer: NodeJS.Timeout | null = null;
if (telegramRetry) {
  const retry = telegramRetry;
  const run = () =>
    processTelegramOutbox({ retry }).catch(err =>
      console.error('[telegram] worker tick failed:', err instanceof Error ? err.message : err)
    );
  telegramTimer = setInterval(run, config.telegramWorkerIntervalMs);
  void run();
  console.log(`[telegram] relay worker every ${config.telegramWorkerIntervalMs} ms`);
}

const shutdown = (signal: string) => {
  console.log(`[gateway] ${signal} received, shutting down`);
  dispatcher.stop();
  clearInterval(dailyCleanup);
  if (telegramTimer) clearInterval(telegramTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
