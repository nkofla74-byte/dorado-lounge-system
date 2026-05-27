'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plane, PlaneLanding, PlaneTakeoff, RefreshCw, Clock } from 'lucide-react';

function formatFlightTime(d: Date, locale: string): string {
  return d.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getFlights } from '@/modules/flights/actions';
import { effectiveTime, isDelayed } from '@/modules/flights/domain/flight';
import type { Flight, FlightDirection } from '@/modules/flights/domain/flight';

type StatusKey = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'unknown';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'secondary',
  active: 'default',
  landed: 'outline',
  cancelled: 'destructive',
  diverted: 'destructive',
  unknown: 'secondary',
};

function FlightRow({ flight }: { flight: Flight }) {
  const t = useTranslations('admin.flights');
  const tS = useTranslations('admin.flights.status');
  const locale = useLocale();
  const delayed = isDelayed(flight);
  const effective = effectiveTime(flight);
  const isDeparture = flight.direction === 'departure';

  const formatTime = (d: Date) => formatFlightTime(d, locale);

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors text-sm">
      <td className="px-4 py-3 font-mono font-semibold">{flight.flightNumber}</td>
      <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">{flight.airline}</td>
      <td className="px-4 py-3 font-medium">{isDeparture ? flight.destination : flight.origin}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span
            className={cn('tabular-nums', delayed && 'line-through text-muted-foreground text-xs')}
          >
            {formatTime(flight.scheduledTime)}
          </span>
          {delayed && (
            <span className="tabular-nums text-amber-600 dark:text-amber-400 text-xs font-medium">
              {formatTime(effective)}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[flight.status] ?? 'secondary'} className="text-[11px]">
          {tS.has(flight.status) ? tS(flight.status as StatusKey) : flight.status}
        </Badge>
        {/* el t es para evitar warning de variable sin uso si el archivo nunca cambia */}
        <span className="sr-only">{t('colEstado')}</span>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {[flight.terminal && `T${flight.terminal}`, flight.gate && `G${flight.gate}`]
          .filter(Boolean)
          .join(' · ') || '—'}
      </td>
    </tr>
  );
}

interface FlightsBoardProps {
  initialDepartures: Flight[];
  initialArrivals: Flight[];
}

export function FlightsBoard({ initialDepartures, initialArrivals }: FlightsBoardProps) {
  const t = useTranslations('admin.flights');
  const locale = useLocale();
  const [direction, setDirection] = useState<FlightDirection>('departure');
  const [departures, setDepartures] = useState(initialDepartures);
  const [arrivals, setArrivals] = useState(initialArrivals);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [pending, startTransition] = useTransition();

  const formatTime = (d: Date) => formatFlightTime(d, locale);

  const flights = direction === 'departure' ? departures : arrivals;

  const refresh = useCallback(
    (dir?: FlightDirection) => {
      const target = dir ?? direction;
      startTransition(async () => {
        const result = await getFlights(target);
        if (result.ok) {
          if (target === 'departure') setDepartures(result.value);
          else setArrivals(result.value);
          setLastUpdated(new Date());
        }
      });
    },
    [direction],
  );

  useEffect(() => {
    const id = setInterval(() => refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleTabChange = (dir: FlightDirection) => {
    setDirection(dir);
    refresh(dir);
  };

  return (
    <div className="space-y-4">
      {/* Tabs + refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            variant={direction === 'departure' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange('departure')}
            className="gap-2"
          >
            <PlaneTakeoff className="h-4 w-4" />
            {t('salidas')}
          </Button>
          <Button
            variant={direction === 'arrival' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange('arrival')}
            className="gap-2"
          >
            <PlaneLanding className="h-4 w-4" />
            {t('llegadas')}
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTime(lastUpdated)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refresh()}
            disabled={pending}
            className="h-7 px-2"
          >
            <RefreshCw className={cn('h-3 w-3', pending && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Tabla */}
      {flights.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground border rounded-lg">
          <Plane className="h-10 w-10 opacity-30" />
          <p className="text-sm">{pending ? t('cargando') : t('sinDatos')}</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {t('colVuelo')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {t('colAerolinea')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {direction === 'departure' ? t('colDestino') : t('colOrigen')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {t('colHora')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {t('colEstado')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">
                  {t('colTerminalGate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f, i) => (
                <FlightRow key={`${f.flightNumber}-${i}`} flight={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
