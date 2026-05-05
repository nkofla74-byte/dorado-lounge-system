import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { ZonaServicio } from '@dorado/shared-types';

export interface MesaTokenPayload extends JWTPayload {
  tenantId: string;
  zona: ZonaServicio;
  mesaNumero: string;
}

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
    .setExpirationTime('4h')
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
