import { describe, it, expect, vi } from 'vitest';
import { buildUpstreamRequest, createProxyHandler, CLIENT_PLACEHOLDER_KEY } from './proxy';

const cfg = { upstream: 'https://proj.supabase.co', anonKey: 'real-anon-key' };

describe('buildUpstreamRequest', () => {
  it('injects the anon key and replaces the client placeholder authorization', () => {
    const req = new Request('http://gateway.local/rest/v1/messages?select=*&apikey=gateway', {
      headers: { apikey: CLIENT_PLACEHOLDER_KEY, authorization: `Bearer ${CLIENT_PLACEHOLDER_KEY}`, host: 'gateway.local' },
    });
    const out = buildUpstreamRequest(req, cfg);
    expect(out.url).toBe('https://proj.supabase.co/rest/v1/messages?select=*&apikey=real-anon-key');
    expect(out.headers.get('apikey')).toBe('real-anon-key');
    expect(out.headers.get('authorization')).toBe('Bearer real-anon-key');
    expect(out.headers.get('host')).toBeNull();
    expect(out.headers.get('x-forwarded-host')).toBe('gateway.local');
  });

  it('keeps the user JWT so RLS still applies upstream', () => {
    const req = new Request('http://gateway.local/rest/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer user.jwt.token', 'content-type': 'application/json', prefer: 'return=representation' },
      body: '{"content":"x"}',
    });
    const out = buildUpstreamRequest(req, cfg);
    expect(out.method).toBe('POST');
    expect(out.headers.get('authorization')).toBe('Bearer user.jwt.token');
    expect(out.headers.get('prefer')).toBe('return=representation');
  });
});

describe('createProxyHandler', () => {
  it('streams the upstream response and drops wire-level headers', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('[]', { status: 206, headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-range': '0-0/0' } })
    );
    const handler = createProxyHandler({ ...cfg, fetchImpl: fetchImpl as any });
    const res = await handler(new Request('http://gateway.local/rest/v1/messages'));
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('0-0/0');
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(await res.text()).toBe('[]');
  });

  it('answers 502 when the upstream is unreachable', async () => {
    const handler = createProxyHandler({ ...cfg, fetchImpl: vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as any });
    const res = await handler(new Request('http://gateway.local/auth/v1/token'));
    expect(res.status).toBe(502);
  });
});
