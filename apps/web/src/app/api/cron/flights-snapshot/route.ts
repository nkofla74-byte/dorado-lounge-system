import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAviationStackProvider } from '@/modules/flights/infrastructure/aviationstack-provider';
import { createFlightRepository } from '@/modules/flights/infrastructure/flight-repository';
import { saveFlightsSnapshot } from '@/modules/flights/application/save-flights-snapshot';
import { createLogger } from '@/lib/logger';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const log = createLogger('cron:flights-snapshot');

// Vercel Cron: captura snapshot diario de vuelos de BOG por tenant activo.
// Programado a las 23:30 Bogotá (04:30 UTC) para capturar el día casi completo
// antes de que pase al siguiente.
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

  const apiKey = process.env.FLIGHTS_API_KEY;
  const apiUrl = process.env.FLIGHTS_API_URL;
  if (!apiKey || !apiUrl) {
    log.info('FLIGHTS_API_KEY/URL no configuradas — snapshot omitido');
    return NextResponse.json({ ok: true, skipped: true, reason: 'flights_api_not_configured' });
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

  const provider = createAviationStackProvider();
  const repo = createFlightRepository();

  let totalDep = 0;
  let totalArr = 0;

  await Promise.allSettled(
    tenants.map(async (t) => {
      try {
        const { departures, arrivals } = await saveFlightsSnapshot(provider, repo, t.id);
        totalDep += departures;
        totalArr += arrivals;
      } catch (err) {
        log.error('Error procesando tenant', { tenantId: t.id, error: String(err) });
      }
    }),
  );

  log.info('Cron flights-snapshot completado', {
    tenants: tenants.length,
    departures: totalDep,
    arrivals: totalArr,
  });

  return NextResponse.json({
    ok: true,
    tenants: tenants.length,
    departures: totalDep,
    arrivals: totalArr,
    timestamp: new Date().toISOString(),
  });
}
