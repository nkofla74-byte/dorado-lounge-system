import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  runCheckVencimientos,
  runCheckDemoraAmex,
  runCheckRequisicionesSinDespachar,
} from '@/modules/alertas/infrastructure/checks';
import { createLogger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const log = createLogger('cron:check-alertas');

// Para cada tenant activo ejecuta los checks de vencimiento y demora AMEX.
//
// La cadencia de 5 minutos la aporta pg_cron (20260516000003); el Vercel Cron de
// vercel.json es un disparo diario de respaldo. Los comentarios anteriores
// afirmaban 5 minutos también aquí, que nunca fue el caso (F-024).
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
  const expectedToken = `Bearer ${cronSecret}`;
  if (
    !authHeader ||
    authHeader.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedToken))
  ) {
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
  let totalRequisiciones = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
    const batch = tenants.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (t) => {
        try {
          const [v, d, r] = await Promise.all([
            runCheckVencimientos(t.id),
            runCheckDemoraAmex(t.id),
            runCheckRequisicionesSinDespachar(t.id),
          ]);
          totalVencimientos += v;
          totalDemoras += d;
          totalRequisiciones += r;
        } catch (err) {
          log.error('Error procesando tenant', { tenantId: t.id, error: String(err) });
        }
      }),
    );
  }

  log.info('Cron check-alertas completado', {
    tenants: tenants.length,
    vencimientos: totalVencimientos,
    demoras: totalDemoras,
    requisiciones: totalRequisiciones,
  });

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    vencimientos: totalVencimientos,
    demoras: totalDemoras,
    requisiciones: totalRequisiciones,
    timestamp: new Date().toISOString(),
  });
}
