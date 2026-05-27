import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomUUID } from 'node:crypto';
import type { ZonaServicio } from '@dorado/shared-types';

export interface MesaTokenPayload extends JWTPayload {
  tenantId: string;
  zona: ZonaServicio;
  mesaNumero: string;
}

const QR_TOKEN_TTL = '12h';

function secret() {
  const raw = process.env['JWT_PASSENGER_SECRET'];
  if (!raw) throw new Error('JWT_PASSENGER_SECRET no configurado');
  return new TextEncoder().encode(raw);
}

export async function generateMesaToken(
  payload: Omit<MesaTokenPayload, keyof JWTPayload>,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(QR_TOKEN_TTL)
    .setJti(randomUUID())
    .sign(secret());
}

export async function verifyMesaToken(token: string): Promise<MesaTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as MesaTokenPayload;
    if (!p.tenantId || !p.zona || !p.mesaNumero) return null;
    return p;
  } catch {
    return null;
  }
}
