'use client';

import { useState, useTransition } from 'react';
import { Clock, Play, Square, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { IniciarTurnoDialog } from './iniciar-turno-dialog';
import { CerrarTurnoDialog } from './cerrar-turno-dialog';
import type { Turno } from '@/modules/turnos/domain/turno';
import type { UserRole } from '@dorado/shared-types';

interface TurnosPanelProps {
  initialTurnos: Turno[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

const CAN_WRITE = new Set<UserRole>(['superuser', 'admin']);

function formatFecha(date: Date): string {
  return new Date(date).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duracion(inicio: Date, fin: Date | null): string {
  const end = fin ?? new Date();
  const diff = Math.floor((end.getTime() - inicio.getTime()) / 60000);
  const horas = Math.floor(diff / 60);
  const minutos = diff % 60;
  return horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
}

export function TurnosPanel({ initialTurnos, userRole, error }: TurnosPanelProps) {
  const [turnos, setTurnos] = useState<Turno[]>(initialTurnos);
  const [iniciarOpen, setIniciarOpen] = useState(false);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [isPending, startTransition] = useTransition();

  const canWrite = userRole ? CAN_WRITE.has(userRole) : false;
  const turnoActivo = turnos.find((t) => t.activo) ?? null;

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
          Actualizar
        </Button>

        <div className="flex-1" />

        {canWrite && (
          <>
            {turnoActivo ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setCerrarOpen(true)}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Cerrar turno activo
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIniciarOpen(true)} className="gap-2">
                <Play className="h-4 w-4" />
                Iniciar turno
              </Button>
            )}
          </>
        )}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Turno activo — banner */}
      {turnoActivo && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{turnoActivo.nombre}</p>
            <p className="text-xs text-muted-foreground">
              Iniciado {formatFecha(turnoActivo.iniciadoAt)} · Duración:{' '}
              {duracion(turnoActivo.iniciadoAt, null)}
            </p>
          </div>
          <Badge className="shrink-0">Activo</Badge>
        </div>
      )}

      {/* Historial */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Historial de turnos</h2>
          <Badge variant="outline" className="text-xs">
            {turnos.length}
          </Badge>
        </div>

        {turnos.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
            No hay turnos registrados
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Nombre
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Inicio
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Cierre
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">
                    Duración
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnos.map((t) => (
                  <TableRow key={t.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{t.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFecha(t.iniciadoAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {t.cerradoAt ? formatFecha(t.cerradoAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {duracion(t.iniciadoAt, t.cerradoAt)}
                    </TableCell>
                    <TableCell>
                      {t.activo ? (
                        <Badge className="text-xs">Activo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Cerrado
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

      {/* Dialogs */}
      <IniciarTurnoDialog open={iniciarOpen} onOpenChange={setIniciarOpen} onIniciado={refresh} />
      {turnoActivo && (
        <CerrarTurnoDialog
          open={cerrarOpen}
          onOpenChange={setCerrarOpen}
          onCerrado={refresh}
          turno={turnoActivo}
        />
      )}
    </div>
  );
}
