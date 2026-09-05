import { createHmac } from 'node:crypto';
import type { Connector, OutboxEvent } from './dispatcher';

export interface WebhookConnectorConfig {
  url: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** `sha256=<hex>` over `${timestamp}.${body}` — the receiver recomputes it with the shared secret. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export function serializeEvent(event: OutboxEvent): string {
  return JSON.stringify({
    id: event.id,
    type: event.event_type,
    occurred_at: event.created_at,
    attempt: event.attempts + 1,
    data: event.payload,
  });
}

/** Generic outbound webhook: any HTTP consumer (an automation platform, an ERP hook, a custom service). */
export function createWebhookConnector(cfg: WebhookConnectorConfig): Connector {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  return {
    name: 'webhook',
    async deliver(event) {
      const body = serializeEvent(event);
      const timestamp = Date.now().toString();
      try {
        const res = await fetchImpl(cfg.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-centras-event-id': event.id,
            'x-centras-event-type': event.event_type,
            'x-centras-timestamp': timestamp,
            'x-centras-signature': signPayload(cfg.secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 10_000),
        });
        return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'delivery failed' };
      }
    },
  };
}
