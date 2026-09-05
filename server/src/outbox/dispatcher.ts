import type { SupabaseClient } from '@supabase/supabase-js';

export interface OutboxEvent {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

export interface OutboxStore {
  claim(limit: number, leaseSeconds: number): Promise<OutboxEvent[]>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export interface Connector {
  name: string;
  deliver(event: OutboxEvent): Promise<{ ok: boolean; error?: string }>;
}

export interface DispatcherOptions {
  pollMs: number;
  batchSize: number;
  leaseSeconds?: number;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  failed: number;
}

/** integration_outbox access through SECURITY DEFINER RPCs (service role only). */
export function createSupabaseOutboxStore(admin: SupabaseClient): OutboxStore {
  return {
    async claim(limit, leaseSeconds) {
      const { data, error } = await admin.rpc('claim_outbox_batch', { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(`claim_outbox_batch failed: ${error.message}`);
      return (data ?? []) as OutboxEvent[];
    },
    async complete(id) {
      const { error } = await admin.rpc('complete_outbox', { p_id: id });
      if (error) throw new Error(`complete_outbox failed: ${error.message}`);
    },
    async fail(id, message) {
      const { error } = await admin.rpc('fail_outbox', { p_id: id, p_error: message.slice(0, 500) });
      if (error) throw new Error(`fail_outbox failed: ${error.message}`);
    },
  };
}

/**
 * Polls the outbox and hands each event to every connector. An event is complete only when all
 * connectors accepted it; otherwise it is rescheduled with backoff by the database function.
 */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: OutboxStore,
    private readonly connectors: Connector[],
    private readonly options: DispatcherOptions
  ) {}

  get hasConnectors(): boolean {
    return this.connectors.length > 0;
  }

  start(): void {
    if (this.timer || !this.hasConnectors) return;
    const tick = () => {
      void this.runOnce().catch(err => this.log.error('[outbox] tick failed:', err instanceof Error ? err.message : err));
    };
    tick();
    this.timer = setInterval(tick, this.options.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { claimed: 0, delivered: 0, failed: 0 };
    if (this.running || !this.hasConnectors) return summary;
    this.running = true;
    try {
      const events = await this.store.claim(this.options.batchSize, this.options.leaseSeconds ?? 60);
      summary.claimed = events.length;
      for (const event of events) {
        const errors: string[] = [];
        for (const connector of this.connectors) {
          const result = await connector.deliver(event);
          if (!result.ok) errors.push(`${connector.name}: ${result.error ?? 'failed'}`);
        }
        if (errors.length === 0) {
          await this.store.complete(event.id);
          summary.delivered++;
        } else {
          await this.store.fail(event.id, errors.join('; '));
          summary.failed++;
        }
      }
      if (summary.claimed > 0) {
        this.log.info(`[outbox] delivered ${summary.delivered}, failed ${summary.failed} of ${summary.claimed}`);
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  private get log() {
    return this.options.log ?? console;
  }
}
