import { NextResponse } from 'next/server';

// Vercel Cron: corre cada 5 minutos (configurado en vercel.json).
// Hace ping al heartbeat de Better Stack para confirmar que el servicio está vivo.
// Si Better Stack no recibe ping en el intervalo configurado, dispara alerta.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Vercel Cron envía el header Authorization con el secret configurado
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
