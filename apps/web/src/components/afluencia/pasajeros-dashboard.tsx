'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Users, Plane, CreditCard, RefreshCw, UserPlus, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { RegistrarPasajeroForm } from './registrar-pasajero-form';
import { getPasajerosByTurno, getTotalPasajerosIndividual } from '@/modules/afluencia/actions';
import type { PasajeroIngreso, TipoAcceso } from '@/modules/afluencia/domain/pasajero-ingreso';

interface TurnoActivo {
  id: string;
  nombre: string;
  teamlider: string;
  iniciadoAt: Date;
}

interface Props {
  turnoActivo: TurnoActivo | null;
}

const TIPO_ACCESO_COLORS: Record<TipoAcceso, string> = {
  amex: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  priority_pass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  diners: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cortesia: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  corporativo: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  otro: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const TIPO_ACCESO_LABELS: Record<TipoAcceso, string> = {
  amex: 'AMEX',
  priority_pass: 'Priority Pass',
  diners: 'Diners',
  cortesia: 'Cortesía',
  corporativo: 'Corp.',
  otro: 'Otro',
};

export function PasajerosDashboard({ turnoActivo }: Props) {
  const t = useTranslations('afluencia');
  const tP = useTranslations('afluencia.pasajero');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CO';
  const [pasajeros, setPasajeros] = useState<PasajeroIngreso[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!turnoActivo) return;
    setLoading(true);
    try {
      const [paxResult, totalResult] = await Promise.all([
        getPasajerosByTurno(turnoActivo.id),
        getTotalPasajerosIndividual(turnoActivo.id),
      ]);
      if (paxResult.ok) setPasajeros(paxResult.value);
      else toast.error(paxResult.error.message);
      if (totalResult.ok) setTotal(totalResult.value);
    } finally {
      setLoading(false);
    }
  }, [turnoActivo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!turnoActivo) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          {t('sinTurnoActivo')}
        </CardContent>
      </Card>
    );
  }

  // Métricas calculadas
  const totalAmex = pasajeros
    .filter((p) => p.zona === 'amex')
    .reduce((s, p) => s + 1 + p.acompanantes, 0);
  const totalSala = total - totalAmex;

  const byTipoAcceso = pasajeros.reduce(
    (acc, p) => {
      const count = 1 + p.acompanantes;
      acc[p.tipoAcceso] = (acc[p.tipoAcceso] ?? 0) + count;
      return acc;
    },
    {} as Record<TipoAcceso, number>,
  );

  const topDestinos = Object.entries(
    pasajeros.reduce(
      (acc, p) => {
        if (p.destino) acc[p.destino] = (acc[p.destino] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topAerolineas = Object.entries(
    pasajeros.reduce(
      (acc, p) => {
        if (p.aerolinea) acc[p.aerolinea] = (acc[p.aerolinea] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Info turno */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              {t('apertura')}
            </p>
            <p className="text-sm font-semibold truncate">
              {new Date(turnoActivo.iniciadoAt).toLocaleTimeString(dateLocale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              {t('teamlider')}
            </p>
            <p className="text-sm font-semibold truncate">{turnoActivo.teamlider}</p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              {t('turnoActivo')}
            </p>
            <p className="text-sm font-semibold truncate text-emerald-600 dark:text-emerald-400">
              {turnoActivo.nombre}
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                {tP('totalTurno')}
              </p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold tabular-nums mt-1">{loading ? '…' : total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                {tP('salaGeneral')}
              </p>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold tabular-nums mt-1">{loading ? '…' : totalSala}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                AMEX
              </p>
              <CreditCard className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-3xl font-bold tabular-nums mt-1 text-blue-400">
              {loading ? '…' : totalAmex}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                {tP('registros')}
              </p>
              <Plane className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-3xl font-bold tabular-nums mt-1">
              {loading ? '…' : pasajeros.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose por tipo de acceso */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(byTipoAcceso).map(([tipo, count]) => (
          <div
            key={tipo}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium',
              TIPO_ACCESO_COLORS[tipo as TipoAcceso],
            )}
          >
            {TIPO_ACCESO_LABELS[tipo as TipoAcceso]}: {count}
          </div>
        ))}
      </div>

      {/* Top destinos y aerolíneas */}
      {(topDestinos.length > 0 || topAerolineas.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topDestinos.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">{tP('topDestinos')}</p>
              <div className="space-y-1">
                {topDestinos.map(([dest, count]) => (
                  <div key={dest} className="flex justify-between text-sm">
                    <span className="font-mono">{dest}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {topAerolineas.length > 0 && (
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {tP('topAerolineas')}
              </p>
              <div className="space-y-1">
                {topAerolineas.map(([airline, count]) => (
                  <div key={airline} className="flex justify-between text-sm">
                    <span className="truncate">{airline}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formulario de registro */}
      <RegistrarPasajeroForm turnoId={turnoActivo.id} onSuccess={loadData} />

      {/* Tabla de registros recientes */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{tP('registrosRecientes')}</h2>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          {t('actualizar')}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading && pasajeros.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : pasajeros.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              {tP('sinRegistros')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tP('colHora')}</TableHead>
                  <TableHead>{tP('colNombre')}</TableHead>
                  <TableHead>{tP('colVuelo')}</TableHead>
                  <TableHead>{tP('colDestino')}</TableHead>
                  <TableHead>{tP('colAcceso')}</TableHead>
                  <TableHead>{tP('colZona')}</TableHead>
                  <TableHead className="text-right">{tP('colPersonas')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pasajeros.slice(0, 50).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="tabular-nums text-sm">
                      {new Date(p.ingresadoAt).toLocaleTimeString(dateLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[150px] truncate">
                      {p.nombrePasajero}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.vueloNumero ? (
                        <span className="flex items-center gap-1">
                          <Plane className="h-3 w-3 text-muted-foreground" />
                          {p.vueloNumero}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{p.destino ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', TIPO_ACCESO_COLORS[p.tipoAcceso])}
                      >
                        {TIPO_ACCESO_LABELS[p.tipoAcceso]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.zona === 'amex' ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30"
                        >
                          AMEX
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Sala</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {1 + p.acompanantes}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
