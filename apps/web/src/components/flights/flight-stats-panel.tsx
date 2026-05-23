'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plane, Users, BarChart3, Percent, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getFlightStats } from '@/modules/flights/actions';
import type { FlightStats } from '@/modules/flights/domain/flight';

function formatPct(value: number | null, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return `${value.toFixed(1)}%`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-start gap-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

export function FlightStatsPanel() {
  const t = useTranslations('admin.flights.stats');
  const locale = useLocale();
  const [stats, setStats] = useState<FlightStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await getFlightStats();
      if (result.ok) setStats(result.value);
      else setError(result.error.message);
    });
  }, []);

  const formatDate = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-CO', {
      day: '2-digit',
      month: 'short',
    });
  };

  if (pending && !stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!stats || stats.ultimos7d.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t('sinDatos')}</AlertDescription>
      </Alert>
    );
  }

  const totalVuelosHoy = stats.hoy ? stats.hoy.departuresVuelos + stats.hoy.arrivalsVuelos : 0;
  const capacidadHoy = stats.hoy?.capacidadEstimada ?? 0;
  const pasajerosHoy = stats.hoy?.pasajerosReales ?? 0;
  const ocupacionHoy = stats.hoy?.ocupacionPct ?? null;
  const fechaHoy = stats.hoy?.fecha;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Plane}
          label={t('kpiVuelosHoy')}
          value={String(totalVuelosHoy)}
          {...(fechaHoy ? { hint: formatDate(fechaHoy) } : {})}
        />
        <KpiCard
          icon={BarChart3}
          label={t('kpiCapacidad')}
          value={capacidadHoy.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
        />
        <KpiCard
          icon={Users}
          label={t('kpiPasajeros')}
          value={pasajerosHoy.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
        />
        <KpiCard
          icon={Percent}
          label={t('kpiOcupacion')}
          value={formatPct(ocupacionHoy, t('noPct'))}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">{t('trendTitle')}</h3>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-xs uppercase">
                  {t('trendColFecha')}
                </th>
                <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                  {t('salidas')}
                </th>
                <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                  {t('llegadas')}
                </th>
                <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                  {t('trendColCapacidad')}
                </th>
                <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                  {t('trendColPasajeros')}
                </th>
                <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                  {t('trendColOcupacion')}
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.ultimos7d.map((r) => (
                <tr key={r.fecha} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.departuresVuelos}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.arrivalsVuelos}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.capacidadEstimada.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.pasajerosReales.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 text-right tabular-nums font-medium',
                      r.ocupacionPct !== null &&
                        r.ocupacionPct >= 80 &&
                        'text-emerald-600 dark:text-emerald-400',
                      r.ocupacionPct !== null &&
                        r.ocupacionPct < 30 &&
                        'text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {formatPct(r.ocupacionPct, t('noPct'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.topAerolineas.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">{t('topAerolineas')}</h3>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-xs uppercase">
                    {t('topColAerolinea')}
                  </th>
                  <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                    {t('topColVuelos')}
                  </th>
                  <th className="text-right px-4 py-2 font-semibold text-xs uppercase">
                    {t('topColCapacidad')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.topAerolineas.map((row) => (
                  <tr key={row.aerolinea} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{row.aerolinea}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.vuelos}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.capacidad.toLocaleString(locale === 'en' ? 'en-US' : 'es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('ayuda')}</p>
    </div>
  );
}
