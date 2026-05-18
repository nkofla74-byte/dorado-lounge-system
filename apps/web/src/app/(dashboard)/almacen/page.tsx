import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getInsumos, getLotesProximosVencer } from '@/modules/inventory/actions';
import { AlmacenPanel } from '@/components/inventory/almacen-panel';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@dorado/shared-types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory.almacenPage');
  return { title: t('metaTitle') };
}

export default async function AlmacenPage() {
  const t = await getTranslations('inventory.almacenPage');
  const supabase = await createClient();
  const [
    result,
    vencimientosResult,
    {
      data: { user },
    },
  ] = await Promise.all([getInsumos(), getLotesProximosVencer(7), supabase.auth.getUser()]);

  const userRole = user?.app_metadata?.role as UserRole | undefined;
  const insumos = result.ok ? result.value : [];
  const capa1 = insumos.filter((i) => i.capa === 'capa_1');
  const lowStock = capa1.filter((i) => i.stockActual <= i.stockMinimo);
  const vencimientos = vencimientosResult.ok ? vencimientosResult.value : [];
  const vencenHoy = vencimientos.filter((v) => v.diasRestantes <= 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsInsumosBodega')}
          </p>
          <p className="text-2xl font-bold tabular-nums">{capa1.length}</p>
        </div>
        <div
          className={`rounded-lg border px-5 py-4 space-y-1 ${
            lowStock.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsStockBajo')}
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${lowStock.length > 0 ? 'text-destructive' : ''}`}
          >
            {lowStock.length}
          </p>
        </div>
        <div
          className={`rounded-lg border px-5 py-4 space-y-1 ${
            vencenHoy.length > 0
              ? 'border-destructive/40 bg-destructive/5'
              : vencimientos.length > 0
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-border bg-card'
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsVencen7')}
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              vencenHoy.length > 0
                ? 'text-destructive'
                : vencimientos.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : ''
            }`}
          >
            {vencimientos.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsOk')}
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {capa1.length - lowStock.length}
          </p>
        </div>
      </div>

      {/* Alerta de vencimientos próximos */}
      {vencimientos.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {t('lotesPorVencer')}
          </p>
          <div className="flex flex-wrap gap-2">
            {vencimientos.map((v) => (
              <span
                key={v.loteId}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                  v.diasRestantes <= 0
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : v.diasRestantes <= 2
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                }`}
              >
                {v.insumoNombre}
                <span className="opacity-70">
                  {v.diasRestantes <= 0
                    ? `— ${t('vencido')}`
                    : v.diasRestantes === 1
                      ? `— ${t('manana')}`
                      : `— ${t('diasShort', { n: v.diasRestantes })}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {result.ok ? (
        <AlmacenPanel initialData={capa1} userRole={userRole} />
      ) : (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          {result.error.message}
        </div>
      )}
    </div>
  );
}
