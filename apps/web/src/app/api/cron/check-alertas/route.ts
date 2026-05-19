import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runCheckVencimientos, runCheckDemoraAmex } from '@/modules/alertas/infrastructure/checks';
import { createLogger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const log = createLogger('cron:check-alertas');

// Vercel Cron: ejecuta cada 5 minutos (configurado en vercel.json).
// Para cada tenant activo ejecuta los checks de vencimiento y demora AMEX.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rl = await rateLimit('cron', getClientIp(request));
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    log.error('CRON_SECRET no configurado');
    return NextResponse.json({ error: 'SERVER_MISCONFIGURED' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tenants, error } = await admin
    .from('tenants')
    .select('id')
    .eq('activo', true)
    .is('deleted_at', null);

  if (error || !tenants || tenants.length === 0) {
    log.warn('No se encontraron tenants activos', { error: error?.message });
    return NextResponse.json({ ok: true, tenants: 0 });
  }

  let totalVencimientos = 0;
  let totalDemoras = 0;

  await Promise.allSettled(
    tenants.map(async (t) => {
      try {
        const [v, d] = await Promise.all([runCheckVencimientos(t.id), runCheckDemoraAmex(t.id)]);
        totalVencimientos += v;
        totalDemoras += d;
      } catch (err) {
        log.error('Error procesando tenant', { tenantId: t.id, error: String(err) });
      }
    }),
  );

  log.info('Cron check-alertas completado', {
    tenants: tenants.length,
    vencimientos: totalVencimientos,
    demoras: totalDemoras,
  });

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    vencimientos: totalVencimientos,
    demoras: totalDemoras,
    timestamp: new Date().toISOString(),
  });
}
