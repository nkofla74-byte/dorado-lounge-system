'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Plane, TrendingUp, Loader2, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getForecastForDate } from '@/modules/flights/actions';
import type { ForecastResult } from '@/modules/flights/domain/forecast';

const ROUTE_COLORS = {
  international_long: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  international_regional: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  domestic: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  lowcost: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
} as const;

function todayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0]!;
}

export function ForecastPanel() {
  const t = useTranslations('admin.flights.forecast');
  const [fecha, setFecha] = useState(todayStr());
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    const result = await getForecastForDate(fecha);
    if (result.ok) {
      setForecast(result.value);
    } else {
      setError(result.error.message);
    }
    setLoading(false);
  };

  const routeTypes = [
    { key: 'international_long' as const, label: t('intlLong') },
    { key: 'international_regional' as const, label: t('intlRegional') },
    { key: 'domestic' as const, label: t('domestic') },
    { key: 'lowcost' as const, label: t('lowcost') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="forecast-date" className="text-xs font-medium text-muted-foreground">
            {t('selectDate')}
          </label>
          <Input
            id="forecast-date"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-44"
          />
        </div>
        <Button onClick={handleLoad} disabled={loading} size="sm">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Calendar className="h-4 w-4 mr-1.5" />
          )}
          {t('calculate')}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {forecast && (
        <div className="space-y-4">
          {/* Main forecast card */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">{t('title')}</h3>
              <span className="text-xs text-muted-foreground ml-auto">{fecha}</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary tabular-nums">
                  {forecast.estimatedLoungeVisitors}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('estimated')}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-muted-foreground tabular-nums">
                  {forecast.rangoMin} – {forecast.rangoMax}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('range')}</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold tabular-nums">
                  {forecast.totalFlights - forecast.cancelledFlights}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t('activeFlights')}</div>
              </div>
            </div>

            {/* Capacity bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {t('totalCapacity')}: {forecast.totalCapacity.toLocaleString()}
                </span>
                <span>
                  {t('estPassengers')}: {forecast.estimatedPassengers.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (forecast.estimatedPassengers / forecast.totalCapacity) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Breakdown by route type */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {routeTypes.map(({ key, label }) => {
              const data = forecast.byRouteType[key];
              if (data.flights === 0) return null;
              return (
                <div key={key} className={cn('rounded-lg border p-3 space-y-1', ROUTE_COLORS[key])}>
                  <div className="text-xs font-medium opacity-80">{label}</div>
                  <div className="flex items-baseline gap-1.5">
                    <Plane className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-lg font-bold tabular-nums">{data.flights}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 opacity-60" />
                    <span className="text-sm font-semibold tabular-nums">
                      ~{Math.round(data.loungeVisitors)}
                    </span>
                    <span className="text-[10px] opacity-60">{t('visitors')}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {forecast.cancelledFlights > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('cancelledNote', { count: forecast.cancelledFlights })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
