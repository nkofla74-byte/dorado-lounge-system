import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getTandas } from '@/modules/production/actions';
import { getRecetas } from '@/modules/recipes/actions';
import { getTurnoActivo } from '@/modules/turnos/actions';
import { getPedidos } from '@/modules/orders/actions';
import { getSolicitudesCocina } from '@/modules/production/actions';
import { TandaTable } from '@/components/production/tanda-table';
import { SolicitudesPanel } from '@/components/production/solicitudes-panel';
import { ProduccionDashboard } from '@/components/production/produccion-dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pasteleria');
  return { title: t('metaTitle') };
}

export default async function PasteleriaPage() {
  const supabase = await createClient();
  const t = await getTranslations('pasteleria');
  const tLayout = await getTranslations('layout');

  const [
    tandasResult,
    recetasResult,
    turnoResult,
    pedidosResult,
    solicitudesResult,
    { data: userData },
  ] = await Promise.all([
    getTandas(),
    getRecetas(),
    getTurnoActivo(),
    getPedidos(),
    getSolicitudesCocina(),
    supabase.auth.getUser(),
  ]);

  const user = userData.user;
  const userRole = user?.app_metadata?.role as string | undefined;
  const isAdminView = userRole === 'admin' || userRole === 'superuser';
  const responsableNombre =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    tLayout('usuarioFallback');

  const turnoActivo = turnoResult.ok ? turnoResult.value : null;
  const allTandas = tandasResult.ok ? tandasResult.value : [];

  if (isAdminView) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboardTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('dashboardSubtitle')}</p>
        </div>
        <ProduccionDashboard tandas={allTandas} />
      </div>
    );
  }

  const pedidosEspeciales = pedidosResult.ok
    ? pedidosResult.value.filter(
        (p) => p.zona === 'amex' && (p.estado === 'creado' || p.estado === 'en_preparacion'),
      )
    : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('pageSubtitle')}</p>
      </div>

      {!turnoActivo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
            {t('sinTurnoActivo')}
          </p>
        </div>
      )}

      {/* Solicitudes de preparación de snack/buffet */}
      <SolicitudesPanel
        initialSolicitudes={solicitudesResult.ok ? solicitudesResult.value : []}
        fetchSolicitudes={async () => {
          'use server';
          const r = await getSolicitudesCocina();
          return r.ok ? r.value : [];
        }}
      />

      {/* Pedidos especiales activos desde Amex */}
      {pedidosEspeciales.length > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-4 space-y-3">
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">
            {t('pedidosEspeciales', { n: pedidosEspeciales.length })}
          </p>
          <ul className="space-y-1.5">
            {pedidosEspeciales.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md bg-background border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium">{p.numeroMesa ?? t('sinMesa')}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {p.items.map((i) => `${i.cantidad}× ${i.recetaNombre}`).join(', ')}
                  </span>
                  <span
                    className={
                      p.estado === 'creado'
                        ? 'text-xs text-blue-600 dark:text-blue-400'
                        : 'text-xs text-amber-600 dark:text-amber-400'
                    }
                  >
                    {p.estado === 'creado' ? t('estadoNuevo') : t('estadoEnPreparacion')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tandas de producción — filtradas a área pastelería */}
      <TandaTable
        initialData={allTandas}
        recetas={recetasResult.ok ? recetasResult.value : []}
        turnoActivo={turnoActivo}
        responsableNombre={responsableNombre}
        error={tandasResult.ok ? undefined : tandasResult.error.message}
        userRole={userRole}
        defaultAreaFilter="pasteleria"
      />
    </div>
  );
}
