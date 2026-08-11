import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('GET /api/audit-ip', () => {
  it('returns the IP from the x-forwarded-for header', async () => {
    const req = new Request('http://localhost/api/audit-ip', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.ip).toBe('203.0.113.9');
  });

  it('falls back to "unknown" with no forwarding header', async () => {
    const req = new Request('http://localhost/api/audit-ip');
    const res = await GET(req as any);
    const body = await res.json();
    expect(body.ip).toBe('unknown');
  });
});
