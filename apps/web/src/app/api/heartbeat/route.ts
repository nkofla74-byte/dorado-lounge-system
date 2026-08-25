import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Vercel Cron: la cadencia real está en vercel.json (hoy diaria; el plan limita
// la frecuencia). Hace ping al heartbeat de Better Stack para confirmar que la
// aplicación está viva.
//
// Este endpoint es el ÚNICO productor del latido: antes existía además un
// workflow de GitHub Actions que pingueaba la misma URL cada 5 minutos, así que
// el monitor seguía en verde aunque el despliegue estuviera caído (F-011).
// Para detección rápida, complementar con un monitor HTTP contra /health.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rl = await rateLimit('heartbeat', getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  // Vercel Cron envía el header Authorization con el secret configurado.
  // Comparación en tiempo constante (timing-safe) — igual que /api/cron/check-alertas.
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${cronSecret}`;
  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const heartbeatUrl = process.env.BETTERSTACK_HEARTBEAT_URL;
  if (!heartbeatUrl) {
    return NextResponse.json({ skipped: true, reason: 'BETTERSTACK_HEARTBEAT_URL not set' });
  }

  try {
    await fetch(heartbeatUrl, { method: 'GET' });
    return NextResponse.json({ ok: true, pinged_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
