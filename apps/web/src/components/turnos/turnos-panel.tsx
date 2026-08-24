'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTurnos } from '@/modules/turnos/actions';
import type { Turno } from '@/modules/turnos/domain/turno';
import { formatBloqueHorario } from '@/lib/turnos';

interface TurnosPanelProps {
  initialTurnos: Turno[];
  error?: string | undefined;
}

export function TurnosPanel({ initialTurnos, error }: TurnosPanelProps) {
  const t = useTranslations('turnos');
  const locale = useLocale();
  const [turnos, setTurnos] = useState<Turno[]>(initialTurnos);
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [isPending, startTransition] = useTransition();

  const activos = turnos.filter((tu) => tu.activo);

  const labelTurno = (tu: Turno): string =>
    tu.bloque
      ? `${t(`bloque_${tu.bloque}` as const)} · ${formatBloqueHorario(tu.bloque)}`
      : tu.nombre;

  const formatFecha = (date: Date): string =>
    new Date(date).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const duracion = (inicio: Date, fin: Date | null): string => {
    const end = fin ?? new Date();
    const diff = Math.floor((end.getTime() - inicio.getTime()) / 60000);
    const horas = Math.floor(diff / 60);
    const minutos = diff % 60;
    return horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
  };

  const refresh = () => {
    startTransition(async () => {
      const result = await getTurnos();
      if (result.ok) {
        setTurnos(result.value);
        setLoadError(undefined);
      } else {
        setLoadError(result.error.message);
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Barra de acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          {t('actualizar')}
        </Button>

        <div className="flex-1" />

        <div className="text-caption text-muted-foreground">
          {t('activosCount', { count: activos.length })}
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Histórico */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-headline font-semibold text-foreground">{t('historialTitle')}</h2>
          <Badge variant="outline" className="text-caption">
            {turnos.length}
          </Badge>
        </div>

        {turnos.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
            {t('sinTurnos')}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-caption font-medium text-muted-foreground">
                    {t('colBloque')}
                  </TableHead>
                  <TableHead className="text-caption font-medium text-muted-foreground">
                    {t('colEmpleado')}
                  </TableHead>
                  <TableHead className="text-caption font-medium text-muted-foreground">
                    {t('colInicio')}
                  </TableHead>
                  <TableHead className="text-caption font-medium text-muted-foreground">
                    {t('colCierre')}
                  </TableHead>
                  <TableHead className="text-caption font-medium text-muted-foreground text-right">
                    {t('colDuracion')}
                  </TableHead>
                  <TableHead className="text-caption font-medium text-muted-foreground">
                    {t('colEstado')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnos.map((tu) => (
                  <TableRow key={tu.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm whitespace-nowrap">
                      {labelTurno(tu)}
                    </TableCell>
                    <TableCell className="text-sm">{tu.teamlider}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFecha(tu.iniciadoAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {tu.cerradoAt ? formatFecha(tu.cerradoAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {duracion(tu.iniciadoAt, tu.cerradoAt)}
                    </TableCell>
                    <TableCell>
                      {tu.activo ? (
                        <Badge className="text-caption">{t('activo')}</Badge>
                      ) : tu.cierreMotivo === 'auto_expiracion' ? (
                        <Badge
                          variant="outline"
                          className="text-caption text-senal-aviso border-senal-aviso/40"
                        >
                          {t('cerradoAuto')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-caption text-muted-foreground">
                          {t('cerrado')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
