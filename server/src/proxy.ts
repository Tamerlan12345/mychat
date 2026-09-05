/**
 * Transparent HTTP proxy in front of Supabase (PostgREST, Auth, Storage, Functions).
 * Clients never hold the project URL or anon key: the gateway injects the key, forwards the
 * user's own JWT untouched (so RLS still applies) and streams the response back.
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'host',
  'content-length',
]);

/** Placeholder key the client library is created with; the gateway swaps it for the real one. */
export const CLIENT_PLACEHOLDER_KEY = 'gateway';

export interface ProxyConfig {
  upstream: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

export function buildUpstreamRequest(req: Request, cfg: ProxyConfig): Request {
  const incoming = new URL(req.url);
  const target = new URL(incoming.pathname + incoming.search, cfg.upstream);
  if (target.searchParams.has('apikey')) target.searchParams.set('apikey', cfg.anonKey);

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set('apikey', cfg.anonKey);
  const auth = headers.get('authorization');
  if (!auth || new RegExp(`^Bearer\\s+${CLIENT_PLACEHOLDER_KEY}$`, 'i').test(auth)) {
    headers.set('authorization', `Bearer ${cfg.anonKey}`);
  }
  headers.set('x-forwarded-host', incoming.host);

  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual' };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
    init.duplex = 'half';
  }
  return new Request(target, init);
}

export function createProxyHandler(cfg: ProxyConfig): (req: Request) => Promise<Response> {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  return async (req: Request) => {
    let upstream: Response;
    try {
      upstream = await fetchImpl(buildUpstreamRequest(req, cfg));
    } catch (err) {
      console.error('[proxy] upstream unreachable:', err instanceof Error ? err.message : err);
      return Response.json({ error: 'Сервер данных недоступен' }, { status: 502 });
    }
    const headers = new Headers(upstream.headers);
    // fetch() already decoded the body; these headers would describe the wire form, not what we send.
    headers.delete('content-encoding');
    headers.delete('content-length');
    headers.delete('transfer-encoding');
    headers.delete('connection');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  };
}
