'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Plane, Clock, UserCheck } from 'lucide-react';
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
import { RegistrarIngresoDialog } from './registrar-ingreso-dialog';
import { getAfluenciaByTurno, getTotalPasajeros } from '@/modules/afluencia/actions';
import type { AfluenciaIngreso } from '@/modules/afluencia/domain/afluencia';

const ZONA_LABELS: Record<string, string> = {
  amex: 'Amex',
  snack: 'Snack',
  buffet: 'Buffet',
};

interface TurnoActivo {
  id: string;
  nombre: string;
  teamlider: string;
  iniciadoAt: Date;
}

interface Props {
  turnoActivo: TurnoActivo | null;
}

export function AfluenciaPanel({ turnoActivo }: Props) {
  const [ingresos, setIngresos] = useState<AfluenciaIngreso[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!turnoActivo) return;
    setLoading(true);
    try {
      const [ingresosResult, totalResult] = await Promise.all([
        getAfluenciaByTurno(turnoActivo.id),
        getTotalPasajeros(turnoActivo.id),
      ]);
      if (ingresosResult.ok) setIngresos(ingresosResult.value);
      else toast.error(ingresosResult.error.message);
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
          No hay turno activo. Inicia un turno para registrar afluencia.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info turno activo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Apertura
            </p>
            <p className="text-sm font-semibold truncate">
              {new Date(turnoActivo.iniciadoAt).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {new Date(turnoActivo.iniciadoAt).toLocaleDateString('es-CO', {
                day: '2-digit',
                month: 'short',
              })}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
          <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Team líder
            </p>
            <p className="text-sm font-semibold truncate">{turnoActivo.teamlider}</p>
          </div>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Turno activo
            </p>
            <p className="text-sm font-semibold truncate text-emerald-600 dark:text-emerald-400">
              {turnoActivo.nombre}
            </p>
          </div>
        </div>
      </div>

      {/* KPI — Total pasajeros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total pasajeros — {turnoActivo.nombre}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold tabular-nums">
              {loading ? '…' : total.toLocaleString('es-CO')}
            </span>
            <Users className="h-6 w-6 text-muted-foreground mb-1" />
          </div>
        </CardContent>
      </Card>

      {/* Controles */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Registro de ingresos</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <RegistrarIngresoDialog turnoId={turnoActivo.id} onSuccess={loadData} />
        </div>
      </div>

      {/* Tabla de ingresos */}
      <Card>
        <CardContent className="p-0">
          {loading && ingresos.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : ingresos.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No hay ingresos registrados en este turno
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead className="text-right">Pasajeros</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Vuelo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingresos.map((ing) => (
                  <TableRow key={ing.id}>
                    <TableCell className="tabular-nums text-sm">
                      {new Date(ing.ingresadoAt).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {ing.cantidad}
                    </TableCell>
                    <TableCell>
                      {ing.zona ? (
                        <Badge variant="outline">{ZONA_LABELS[ing.zona] ?? ing.zona}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Todas</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {ing.vueloNumero ? (
                        <span className="flex items-center gap-1.5 text-sm">
                          <Plane className="h-3 w-3 text-muted-foreground" />
                          {ing.vueloNumero}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
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
