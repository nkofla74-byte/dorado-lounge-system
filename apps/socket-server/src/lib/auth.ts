import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { CHANNEL_ACL } from '@dorado/shared-types';
import type { Channel, UserRole } from '@dorado/shared-types';
import { logger } from './logger';

export interface SocketData {
  userId: string;
  tenantId: string;
  role: UserRole;
}

const JWT_SECRET = process.env['SUPABASE_JWT_SECRET'];

export function authenticateHandshake(socket: Socket, next: (err?: ExtendedError) => void): void {
  if (!JWT_SECRET) {
    logger.error({ event: 'auth_missing_jwt_secret' });
    return next(new Error('SERVER_MISCONFIGURED'));
  }

  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    logger.warn({ event: 'auth_missing_token', socketId: socket.id });
    return next(new Error('UNAUTHENTICATED'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    const appMeta = decoded.app_metadata as { tenant_id?: string; role?: string } | undefined;

    if (!appMeta?.tenant_id || !appMeta?.role) {
      logger.warn({ event: 'auth_invalid_claims', socketId: socket.id });
      return next(new Error('INVALID_CLAIMS'));
    }

    socket.data = {
      userId: decoded.sub ?? '',
      tenantId: appMeta.tenant_id,
      role: appMeta.role as UserRole,
    } satisfies SocketData;

    next();
  } catch (e) {
    logger.warn({ event: 'auth_invalid_token', socketId: socket.id, error: (e as Error).message });
    next(new Error('INVALID_TOKEN'));
  }
}

// Verifica si el socket tiene permiso para unirse al canal.
// Un intento de unión no autorizado es un evento de seguridad (se loguea pero
// no se registra en audit_log aquí — eso corresponde al módulo de auditoría).
export function canJoinChannel(socket: Socket, channel: string): boolean {
  const data = socket.data as SocketData | undefined;
  if (!data?.role) return false;

  const allowed = CHANNEL_ACL[channel as Channel];
  if (!allowed) {
    logger.warn({ event: 'channel_unknown', socketId: socket.id, channel });
    return false;
  }

  return allowed.includes(data.role);
}
