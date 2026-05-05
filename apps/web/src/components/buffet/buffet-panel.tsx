'use client';

import { useState, useTransition } from 'react';
import { UtensilsCrossed, Ticket, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDespachos, getTicketsByTurno } from '@/modules/buffet/actions';
import { DespacharLoteDialog } from './despachar-lote-dialog';
import { RegistrarTicketsDialog } from './registrar-tickets-dialog';
import type { DespachoBuffet } from '@/modules/buffet/domain/despacho-buffet';
import type { TicketTurno, TurnoActivo } from '@/modules/buffet/domain/ticket-turno';
import type { UserRole } from '@dorado/shared-types';

interface Receta {
  id: string;
  nombre: string;
  porciones: number;
}

interface BuffetPanelProps {
  initialDespachos: DespachoBuffet[];
  recetas: Receta[];
  turnos: TurnoActivo[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

const WRITE_ROLES = new Set<UserRole>(['superuser', 'admin', 'personal_buffet']);

function formatFecha(date: Date): string {
  return new Date(date).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BuffetPanel({
  initialDespachos,
  recetas,
  turnos,
  userRole,
  error,
}: BuffetPanelProps) {
  const [despachos, setDespachos] = useState<DespachoBuffet[]>(initialDespachos);
  const [tickets, setTickets] = useState<TicketTurno[]>([]);
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');
  const [despacharOpen, setDespacharOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [isPending, startTransition] = useTransition();

  const canWrite = userRole ? WRITE_ROLES.has(userRole) : false;

  const refreshDespachos = () => {
    startTransition(async () => {
      const result = await getDespachos(selectedTurnoId || undefined);
      if (result.ok) {
        setDespachos(result.value);
        setLoadError(undefined);
      } else {
        setLoadError(result.error.message);
      }
    });
  };

  const loadTickets = (turnoId: string) => {
    if (!turnoId) {
      setTickets([]);
      return;
    }
    startTransition(async () => {
      const result = await getTicketsByTurno(turnoId);
      if (result.ok) setTickets(result.value);
    });
  };

  const handleTurnoChange = (value: string) => {
    setSelectedTurnoId(value);
    loadTickets(value);
    startTransition(async () => {
      const result = await getDespachos(value || undefined);
      if (result.ok) setDespachos(result.value);
    });
  };

  return (
    <div className="space-y-8">
      {/* Barra de acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        {turnos.length > 0 && (
          <Select value={selectedTurnoId} onValueChange={handleTurnoChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos los turnos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los turnos</SelectItem>
              {turnos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={refreshDespachos}
          disabled={isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>

        <div className="flex-1" />

        {canWrite && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTicketsOpen(true)}
              className="gap-2"
            >
              <Ticket className="h-4 w-4" />
              Registrar tickets al cierre
            </Button>
            <Button size="sm" onClick={() => setDespacharOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Despachar lote
            </Button>
          </>
        )}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Despachos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Despachos al buffet</h2>
          <Badge variant="outline" className="text-xs">
            {despachos.length}
          </Badge>
        </div>

        {despachos.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
            No hay despachos registrados
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Receta
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">
                    Batches
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Turno</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Despachado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {despachos.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{d.recetaNombre}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{d.cantidad}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.turnoId ? (turnos.find((t) => t.id === d.turnoId)?.nombre ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFecha(d.despachadoAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Tickets del turno seleccionado */}
      {selectedTurnoId && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Tickets de cierre</h2>
            <Badge variant="outline" className="text-xs">
              {tickets.reduce((acc, t) => acc + t.cantidadTickets, 0)} total
            </Badge>
          </div>

          {tickets.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
              Sin registros de tickets para este turno
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs font-medium text-muted-foreground">
                      Turno
                    </TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground text-right">
                      Tickets
                    </TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">
                      Registrado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{t.turnoNombre}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {t.cantidadTickets}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatFecha(t.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {/* Dialogs */}
      <DespacharLoteDialog
        open={despacharOpen}
        onOpenChange={setDespacharOpen}
        onDespachado={refreshDespachos}
        recetas={recetas}
        turnos={turnos}
      />
      <RegistrarTicketsDialog
        open={ticketsOpen}
        onOpenChange={setTicketsOpen}
        onRegistrado={() => {
          if (selectedTurnoId) loadTickets(selectedTurnoId);
        }}
        turnos={turnos}
      />
    </div>
  );
}
