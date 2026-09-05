import type { Server } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';

export interface RealtimeProxyConfig {
  upstream: string;
  anonKey: string;
}

/**
 * Bridges the client's Realtime WebSocket to Supabase. Only the apikey is rewritten; the
 * `phx_join` payload (which carries the user's access token for RLS) passes through untouched.
 */
export function attachRealtimeProxy(server: Server, cfg: RealtimeProxyConfig): void {
  const wss = new WebSocketServer({ noServer: true });
  const upstreamBase = cfg.upstream.replace(/^http/i, 'ws');

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://gateway.local');
    if (!url.pathname.startsWith('/realtime/v1')) {
      socket.destroy();
      return;
    }
    url.searchParams.set('apikey', cfg.anonKey);
    const target = `${upstreamBase}${url.pathname}${url.search}`;

    wss.handleUpgrade(req, socket, head, client => {
      const upstream = new WebSocket(target, { headers: { apikey: cfg.anonKey } });
      const queued: Array<{ data: RawData; binary: boolean }> = [];

      const closeBoth = () => {
        try {
          client.close();
        } catch {}
        try {
          upstream.close();
        } catch {}
      };

      upstream.on('open', () => {
        queued.forEach(m => upstream.send(m.data, { binary: m.binary }));
        queued.length = 0;
      });
      client.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
        else queued.push({ data, binary: isBinary });
      });
      upstream.on('message', (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
      });
      client.on('close', closeBoth);
      upstream.on('close', closeBoth);
      client.on('error', closeBoth);
      upstream.on('error', err => {
        console.error('[realtime-proxy] upstream error:', err.message);
        closeBoth();
      });
    });
  });
}
