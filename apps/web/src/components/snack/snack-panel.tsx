'use client';

import { useState, useTransition } from 'react';
import {
  UtensilsCrossed,
  Bell,
  ArrowDownToLine,
  RefreshCw,
  AlertTriangle,
  Clock,
} from 'lucide-react';
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
import { getDespachos, getStuartRequests } from '@/modules/snack/actions';
import { EnviarStuartDialog } from './enviar-stuart-dialog';
import { StockOutSnackDialog } from './stock-out-snack-dialog';
import type { DespachoSnack, TurnoActivo } from '@/modules/snack/domain/despacho-snack';
import type { StuartRequest } from '@/modules/snack/domain/stuart-request';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { UserRole } from '@dorado/shared-types';

interface SnackPanelProps {
  initialDespachos: DespachoSnack[];
  initialStuart: StuartRequest[];
  turnos: TurnoActivo[];
  insumos: InsumoWithStock[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

const WRITE_ROLES = new Set<UserRole>(['superuser', 'admin', 'personal_snack']);

function formatFecha(date: Date): string {
  return new Date(date).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SnackPanel({
  initialDespachos,
  initialStuart,
  turnos,
  insumos,
  userRole,
  error,
}: SnackPanelProps) {
  const [despachos, setDespachos] = useState<DespachoSnack[]>(initialDespachos);
  const [stuartRequests, setStuartRequests] = useState<StuartRequest[]>(initialStuart);
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');
  const [stuartOpen, setStuartOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
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

  const refreshStuart = () => {
    startTransition(async () => {
      const result = await getStuartRequests();
      if (result.ok) setStuartRequests(result.value);
    });
  };

  const handleTurnoChange = (value: string) => {
    const turnoId = value === 'all' ? '' : value;
    setSelectedTurnoId(turnoId);
    startTransition(async () => {
      const result = await getDespachos(turnoId || undefined);
      if (result.ok) setDespachos(result.value);
    });
  };

  return (
    <div className="space-y-8">
      {/* Barra de acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        {turnos.length > 0 && (
          <Select value={selectedTurnoId || 'all'} onValueChange={handleTurnoChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos los turnos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los turnos</SelectItem>
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
              onClick={() => setStuartOpen(true)}
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Solicitar Stuart
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setStockOutOpen(true)}
              className="gap-2"
            >
              <ArrowDownToLine className="h-4 w-4" />
              Stock Out
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

      {/* Despachos de cocina */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Despachos desde cocina</h2>
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

      {/* Solicitudes Stuart recientes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Solicitudes Stuart recientes</h2>
          <Badge variant="outline" className="text-xs">
            {stuartRequests.length}
          </Badge>
        </div>

        {stuartRequests.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
            Sin solicitudes Stuart registradas
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Descripción
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Enviado
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stuartRequests.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">{s.descripcion}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFecha(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Dialogs */}
      <EnviarStuartDialog
        open={stuartOpen}
        onOpenChange={setStuartOpen}
        onEnviado={refreshStuart}
      />
      <StockOutSnackDialog
        open={stockOutOpen}
        onOpenChange={setStockOutOpen}
        onRegistrado={() => {}}
        insumos={insumos}
      />
    </div>
  );
}
