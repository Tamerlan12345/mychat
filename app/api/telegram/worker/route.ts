import { createHash, timingSafeEqual } from 'node:crypto';

import { getTelegramConfig } from '@/lib/telegram/config';
import { processTelegramOutbox } from '@/lib/telegram/outbox-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeResponse(status: number, headers?: HeadersInit): Response {
  return new Response(null, { status, headers });
}

function methodNotAllowed(): Response {
  return safeResponse(405, { Allow: 'POST' });
}

function safeSecretMatches(received: string, expected: string): boolean {
  const receivedDigest = createHash('sha256').update(received, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

export async function POST(request: Request): Promise<Response> {
  let config: ReturnType<typeof getTelegramConfig>;
  try {
    config = getTelegramConfig();
  } catch {
    return safeResponse(503);
  }

  const receivedSecret = request.headers.get('X-Worker-Secret');
  if (!receivedSecret || !safeSecretMatches(receivedSecret, config.workerSecret)) {
    return safeResponse(401);
  }

  try {
    const counts = await processTelegramOutbox({ retry: config.retry });
    return Response.json(counts);
  } catch {
    return Response.json({ error: 'Telegram worker operation failed.' }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function PUT(): Promise<Response> {
  return methodNotAllowed();
}

export async function PATCH(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
  return methodNotAllowed();
}

export async function HEAD(): Promise<Response> {
  return methodNotAllowed();
}
