import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { OutboxDispatcher, type OutboxEvent, type OutboxStore } from './dispatcher';
import { createWebhookConnector, serializeEvent, signPayload } from './webhook';

const event: OutboxEvent = {
  id: 'evt-1',
  event_type: 'message.created',
  payload: { v: 1, message: { text: 'Привет' } },
  attempts: 0,
  max_attempts: 8,
  created_at: '2026-09-06T10:00:00Z',
};

function makeStore(events: OutboxEvent[]): OutboxStore & { complete: any; fail: any; claim: any } {
  return {
    claim: vi.fn().mockResolvedValue(events),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

const quiet = { info: () => {}, warn: () => {}, error: () => {} };

describe('OutboxDispatcher', () => {
  it('completes events every connector accepted and fails the rest with the reasons', async () => {
    const store = makeStore([event, { ...event, id: 'evt-2' }]);
    const good = { name: 'webhook', deliver: vi.fn().mockResolvedValue({ ok: true }) };
    const flaky = {
      name: 'email',
      deliver: vi.fn().mockImplementation(async (e: OutboxEvent) => (e.id === 'evt-2' ? { ok: false, error: 'SMTP 451' } : { ok: true })),
    };
    const dispatcher = new OutboxDispatcher(store, [good, flaky], { pollMs: 1000, batchSize: 10, log: quiet });

    const summary = await dispatcher.runOnce();

    expect(summary).toEqual({ claimed: 2, delivered: 1, failed: 1 });
    expect(store.complete).toHaveBeenCalledWith('evt-1');
    expect(store.fail).toHaveBeenCalledWith('evt-2', 'email: SMTP 451');
  });

  it('does not touch the queue when no connector is configured', async () => {
    const store = makeStore([event]);
    const dispatcher = new OutboxDispatcher(store, [], { pollMs: 1000, batchSize: 10, log: quiet });
    expect(await dispatcher.runOnce()).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(store.claim).not.toHaveBeenCalled();
    expect(dispatcher.hasConnectors).toBe(false);
  });
});

describe('webhook connector', () => {
  it('signs the body with HMAC-SHA256 over timestamp.body and sends the event headers', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(null, { status: 204 });
    });
    const connector = createWebhookConnector({ url: 'https://hooks.example.com/x', secret: 's3cret', fetchImpl: fetchImpl as any });

    const result = await connector.deliver(event);

    expect(result).toEqual({ ok: true });
    const headers = captured!.init.headers as Record<string, string>;
    const body = captured!.init.body as string;
    expect(JSON.parse(body)).toMatchObject({ id: 'evt-1', type: 'message.created', attempt: 1, data: event.payload });
    const expected = `sha256=${createHmac('sha256', 's3cret').update(`${headers['x-centras-timestamp']}.${body}`).digest('hex')}`;
    expect(headers['x-centras-signature']).toBe(expected);
    expect(headers['x-centras-event-id']).toBe('evt-1');
    expect(signPayload('s3cret', headers['x-centras-timestamp'], serializeEvent(event))).toBe(expected);
  });

  it('reports HTTP failures and network errors without throwing', async () => {
    const failing = createWebhookConnector({ url: 'https://h/x', secret: 's', fetchImpl: vi.fn(async () => new Response(null, { status: 500 })) as any });
    expect(await failing.deliver(event)).toEqual({ ok: false, error: 'HTTP 500' });
    const down = createWebhookConnector({ url: 'https://h/x', secret: 's', fetchImpl: vi.fn(async () => { throw new Error('ENOTFOUND'); }) as any });
    expect(await down.deliver(event)).toEqual({ ok: false, error: 'ENOTFOUND' });
  });
});
