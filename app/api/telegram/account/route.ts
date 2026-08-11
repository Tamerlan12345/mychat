import { getTelegramConfig } from '@/lib/telegram/config';
import {
  createTelegramLink,
  createTelegramUserScope,
  disconnectTelegramIdentity,
  TelegramRepositoryError,
} from '@/lib/telegram/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function repositoryErrorCode(error: unknown): string | undefined {
  if (error instanceof TelegramRepositoryError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function accessToken(request: Request): string | null {
  const value = request.headers.get('authorization');
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function safeError(status: number): Response {
  return Response.json({ error: 'Telegram account operation failed.' }, { status });
}

async function currentScope(request: Request) {
  const token = accessToken(request);
  if (!token) return null;
  return createTelegramUserScope(token);
}

function statusForRepositoryError(error: unknown): number {
  const code = repositoryErrorCode(error);
  if (code === 'AUTHENTICATION_ERROR') return 401;
  if (code === 'CONFIGURATION_ERROR') return 503;
  return 500;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const config = getTelegramConfig();
    const scope = await currentScope(request);
    if (!scope) return safeError(401);

    const link = await createTelegramLink(scope);
    return Response.json({
      deepLink: `https://t.me/${config.botUsername.replace(/^@/, '')}?start=${link.rawToken}`,
      expiresAt: link.expiresAt,
    });
  } catch (error) {
    return safeError(error instanceof Error && error.message.startsWith('Missing required') ? 503 : statusForRepositoryError(error));
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    getTelegramConfig();
    const scope = await currentScope(request);
    if (!scope) return safeError(401);

    await disconnectTelegramIdentity(scope);
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error instanceof Error && error.message.startsWith('Missing required') ? 503 : statusForRepositoryError(error));
  }
}
