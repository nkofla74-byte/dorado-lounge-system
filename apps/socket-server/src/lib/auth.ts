import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { CHANNEL_ACL } from '@dorado/shared-types';
import type { Channel, UserRole } from '@dorado/shared-types';
import { logger } from './logger';

export interface SocketData {
  userId: string;
  tenantId: string;
  role: UserRole;
  /** Vencimiento del token (epoch en segundos), si el JWT lo declara. */
  expiraEn: number | null;
}

interface JwtClaims {
  sub?: string;
  exp?: number;
  app_metadata?: { tenant_id?: string; role?: string };
}

// JWKS remoto cacheado: Supabase migró a llaves de firma asimétricas (ES256),
// así que los access tokens actuales se verifican contra el endpoint público
// /auth/v1/.well-known/jwks.json. createRemoteJWKSet cachea las llaves.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwks) return jwks;
  const base = process.env['SUPABASE_URL'];
  if (!base) return null;
  jwks = createRemoteJWKSet(new URL(`${base.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

// Solo para tests: resetea el JWKS cacheado.
export function __resetJwksCache(): void {
  jwks = null;
}

async function verifyToken(token: string): Promise<JwtClaims> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('INVALID_TOKEN');
  }

  // Tokens legacy HS256 firmados con el secret simétrico de Supabase.
  //
  // El verificador se elige por la cabecera `alg`, que la controla quien emite
  // el token. Aquí no es explotable —HS256 exige el secreto real y la rama
  // asimétrica está restringida por lista de algoritmos— pero mientras el
  // secreto simétrico siga aceptándose, su filtración permite falsificar
  // cualquier claim. Por eso la rama legacy es opt-in explícito (F-030): una vez
  // migrado el proyecto a llaves asimétricas, se apaga y se rota el secreto.
  if (decoded.header.alg === 'HS256') {
    if (process.env['ALLOW_LEGACY_HS256'] !== 'true') {
      logger.warn({ event: 'auth_hs256_deshabilitado' });
      throw new Error('INVALID_TOKEN');
    }
    const secret = process.env['SUPABASE_JWT_SECRET'];
    if (!secret) throw new Error('SERVER_MISCONFIGURED');
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtClaims;
  }

  // Tokens actuales de Supabase: asimétricos (ES256/RS256) vía JWKS.
  const keySet = getJwks();
  if (!keySet) throw new Error('SERVER_MISCONFIGURED');
  const { payload } = await jwtVerify(token, keySet, { algorithms: ['ES256', 'RS256'] });
  return payload as JwtClaims;
}

export async function authenticateHandshake(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    logger.warn({ event: 'auth_missing_token', socketId: socket.id });
    return next(new Error('UNAUTHENTICATED'));
  }

  let claims: JwtClaims;
  try {
    claims = await verifyToken(token);
  } catch (e) {
    const message = (e as Error).message;
    if (message === 'SERVER_MISCONFIGURED') {
      logger.error({ event: 'auth_server_misconfigured', socketId: socket.id });
      return next(new Error('SERVER_MISCONFIGURED'));
    }
    logger.warn({ event: 'auth_invalid_token', socketId: socket.id, error: message });
    return next(new Error('INVALID_TOKEN'));
  }

  const appMeta = claims.app_metadata;
  if (!appMeta?.tenant_id || !appMeta?.role) {
    logger.warn({ event: 'auth_invalid_claims', socketId: socket.id });
    return next(new Error('INVALID_CLAIMS'));
  }

  socket.data = {
    userId: claims.sub ?? '',
    tenantId: appMeta.tenant_id,
    role: appMeta.role as UserRole,
    expiraEn: typeof claims.exp === 'number' ? claims.exp : null,
  } satisfies SocketData;

  next();
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

/**
 * Milisegundos que le quedan de vida al token del socket, o null si el JWT no
 * declara `exp`.
 *
 * La autorización de canales se resolvía con `socket.data`, una foto del
 * handshake que nunca caducaba: en una sala 24/7 con tabletas siempre
 * encendidas, un socket conservaba indefinidamente el rol y el tenant del
 * momento de conectarse, incluso tras degradar o desactivar al usuario (F-014).
 */
export function msHastaExpiracion(socket: Socket, ahora = Date.now()): number | null {
  const data = socket.data as SocketData | undefined;
  if (!data || data.expiraEn === null) return null;
  return data.expiraEn * 1000 - ahora;
}
