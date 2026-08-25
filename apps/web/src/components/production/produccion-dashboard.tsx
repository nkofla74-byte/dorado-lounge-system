'use client';

import { useTranslations } from 'next-intl';
import { Clock, ChefHat, Truck, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Tanda } from '@/modules/production/domain/tanda';

interface Props {
  tandas: Tanda[];
}

type ZonaKey = 'amex' | 'snack' | 'buffet';

const ZONA_CONFIG: Record<ZonaKey, { icon: typeof ChefHat; colorClass: string }> = {
  amex: {
    icon: Truck,
    colorClass: 'border-senal-curso/30 bg-senal-curso/5 text-senal-curso dark:text-senal-curso',
  },
  buffet: {
    icon: Package,
    colorClass: 'border-senal-ok/30 bg-senal-ok/5 text-senal-ok dark:text-senal-ok',
  },
  snack: {
    icon: ChefHat,
    colorClass: 'border-senal-aviso/30 bg-senal-aviso/5 text-senal-aviso dark:text-senal-aviso',
  },
};

function formatHora(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(d: Date): string {
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export function ProduccionDashboard({ tandas }: Props) {
  const t = useTranslations('production.dashboard');
  const tZ = useTranslations('zonas');

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const tandasHoy = tandas.filter((td) => {
    const created = new Date(td.createdAt);
    return created >= hoy;
  });

  const completadas = tandasHoy.filter((td) => td.estado === 'completada');
  const enProceso = tandasHoy.filter((td) => td.estado === 'en_proceso');
  const planificadas = tandasHoy.filter((td) => td.estado === 'planificada');

  const zonas: ZonaKey[] = ['amex', 'buffet', 'snack'];

  const porZona = (zona: ZonaKey) =>
    completadas
      .filter((td) => td.zonaDestino === zona)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  const totalCompletadas = completadas.length;
  const totalTandas = completadas.reduce((sum, td) => sum + td.cantidadTandas, 0);

  return (
    <div className="space-y-6">
      {/* Resumen del día */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label={t('completadas')} value={totalCompletadas} />
        <SummaryCard label={t('totalTandas')} value={totalTandas} />
        <SummaryCard label={t('enProceso')} value={enProceso.length} />
        <SummaryCard label={t('planificadas')} value={planificadas.length} />
      </div>

      {/* Por zona */}
      {zonas.map((zona) => {
        const items = porZona(zona);
        const config = ZONA_CONFIG[zona];
        const Icon = config.icon;
        const ultimaHora = items[0]?.completedAt ?? null;

        return (
          <div key={zona} className="space-y-3">
            <div
              className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${config.colorClass}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="font-semibold text-sm">{tZ(zona)}</span>
                <Badge variant="secondary" className="text-caption">
                  {items.length} {t('despachos')}
                </Badge>
              </div>
              {ultimaHora && (
                <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t('ultimoDespacho')}: {formatHora(ultimaHora)}
                  </span>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                {t('sinDespachos')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-caption text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">{t('colReceta')}</th>
                      <th className="text-center py-2 px-3 font-medium">{t('colTandas')}</th>
                      <th className="text-left py-2 px-3 font-medium">{t('colResponsable')}</th>
                      <th className="text-right py-2 px-3 font-medium">{t('colHora')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((td) => (
                      <tr
                        key={td.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2 px-3 font-medium">{td.recetaNombre}</td>
                        <td className="py-2 px-3 text-center tabular-nums">{td.cantidadTandas}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {td.responsableNombre ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">
                          {formatHora(td.completedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {totalCompletadas === 0 && enProceso.length === 0 && planificadas.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">{t('sinProduccionHoy')}</div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
