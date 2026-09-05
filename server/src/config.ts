export interface GatewayConfig {
  host: string;
  port: number;
  version: string;
  minClientVersion: string;
  /** Public URL clients use to reach this gateway (for bootstrap/self-links). */
  publicUrl?: string;
  corsOrigins: string[];
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  /** Bearer token external systems (or the future n8n) use to post as the integration bot. */
  integrationBotToken?: string;
  /** profiles.id that bot-posted messages are attributed to. */
  integrationBotUserId?: string;
  /** Generic outbound webhook consumer of integration_outbox (HMAC-signed). */
  outboxWebhookUrl?: string;
  outboxWebhookSecret?: string;
  outboxPollMs: number;
  outboxBatchSize: number;
  telegramWorkerIntervalMs: number;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Gateway configuration error: ${key} is required`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const supabaseAnonKey = required(env, 'SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = required(env, 'SUPABASE_SERVICE_ROLE_KEY');

  const webhookUrl = optional(env, 'OUTBOX_WEBHOOK_URL');
  const webhookSecret = optional(env, 'OUTBOX_WEBHOOK_SECRET');
  if (webhookUrl && !webhookSecret) {
    throw new Error('Gateway configuration error: OUTBOX_WEBHOOK_SECRET is required when OUTBOX_WEBHOOK_URL is set');
  }

  // The shared lib/telegram code reads the Next-style variable names; feed them from the server ones.
  env.NEXT_PUBLIC_SUPABASE_URL ||= supabaseUrl;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= supabaseAnonKey;

  return {
    host: optional(env, 'GATEWAY_HOST') ?? '0.0.0.0',
    port: integer(env, 'GATEWAY_PORT', 8080),
    version: optional(env, 'GATEWAY_VERSION') ?? optional(env, 'npm_package_version') ?? '1.0.0',
    minClientVersion: optional(env, 'MIN_CLIENT_VERSION') ?? '1.0.0',
    publicUrl: optional(env, 'GATEWAY_PUBLIC_URL')?.replace(/\/+$/, ''),
    corsOrigins: (optional(env, 'CORS_ORIGINS') ?? '*').split(',').map(s => s.trim()).filter(Boolean),
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    integrationBotToken: optional(env, 'INTEGRATION_BOT_TOKEN'),
    integrationBotUserId: optional(env, 'INTEGRATION_BOT_USER_ID'),
    outboxWebhookUrl: webhookUrl,
    outboxWebhookSecret: webhookSecret,
    outboxPollMs: integer(env, 'OUTBOX_POLL_MS', 5000),
    outboxBatchSize: integer(env, 'OUTBOX_BATCH_SIZE', 20),
    telegramWorkerIntervalMs: integer(env, 'TELEGRAM_WORKER_INTERVAL_MS', 60_000),
  };
}
