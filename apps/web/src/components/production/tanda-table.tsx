'use client';

import { Fragment, useState } from 'react';
import { ChefHat, AlertTriangle, Plus, RefreshCw } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import {
  getTandas,
  iniciarTanda,
  completarTanda,
  cancelarTanda,
} from '@/modules/production/actions';
import { CreateTandaDialog } from './create-tanda-dialog';
import type { Tanda, EstadoTanda } from '@/modules/production/domain/tanda';
import type { RecetaWithIngredientes } from '@/modules/recipes/domain/recipe';

const ESTADO_LABEL: Record<EstadoTanda, string> = {
  planificada: 'Planificada',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function EstadoBadge({ estado }: { estado: EstadoTanda }) {
  const baseClass = 'text-xs font-medium';
  if (estado === 'planificada')
    return (
      <Badge variant="secondary" className={baseClass}>
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  if (estado === 'en_proceso')
    return (
      <Badge
        className={cn(
          baseClass,
          'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20',
        )}
      >
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  if (estado === 'completada')
    return (
      <Badge
        className={cn(
          baseClass,
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20',
        )}
      >
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  return (
    <Badge variant="outline" className={cn(baseClass, 'text-muted-foreground')}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

interface TandaTableProps {
  initialData: Tanda[];
  recetas: RecetaWithIngredientes[];
  error?: string | undefined;
}

export function TandaTable({ initialData, recetas, error: initialError }: TandaTableProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initialError);
  const [createOpen, setCreateOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const recetasProduccion = recetas.filter((r) => r.tipoReceta === 'produccion');

  const refresh = async () => {
    setLoading(true);
    setFetchError(undefined);
    const result = await getTandas();
    if (result.ok) {
      setData(result.value);
    } else {
      setFetchError(result.error.message);
    }
    setLoading(false);
  };

  const applyResult = (updated: Tanda) => {
    setData((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const runAction = async (
    id: string,
    action: (id: string) => Promise<{ ok: boolean; value?: Tanda; error?: { message: string } }>,
  ) => {
    setProcessingId(id);
    setRowError(null);
    const result = await action(id);
    if (result.ok && result.value) {
      applyResult(result.value);
    } else {
      setRowError({ id, message: result.error?.message ?? 'Error desconocido' });
    }
    setProcessingId(null);
    setConfirmingId(null);
  };

  const handleCreated = () => {
    setCreateOpen(false);
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChefHat className="h-4 w-4" />
          <span>{data.length} tandas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva tanda
          </Button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>Receta</TableHead>
              <TableHead className="text-center">Tandas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                  No hay tandas registradas. Crea la primera con el botón de arriba.
                </TableCell>
              </TableRow>
            ) : (
              data.map((tanda) => {
                const isProcessing = processingId === tanda.id;
                const isConfirming = confirmingId === tanda.id;
                const error = rowError?.id === tanda.id ? rowError.message : null;

                return (
                  <Fragment key={tanda.id}>
                    <TableRow className="border-border">
                      <TableCell className="font-medium">{tanda.recetaNombre}</TableCell>
                      <TableCell className="text-center tabular-nums text-sm">
                        {tanda.cantidadTandas}
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={tanda.estado} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(tanda.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tanda.estado === 'planificada' && !isConfirming && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={isProcessing}
                                onClick={() => runAction(tanda.id, iniciarTanda)}
                              >
                                Iniciar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={isProcessing}
                                onClick={() => runAction(tanda.id, cancelarTanda)}
                              >
                                Cancelar
                              </Button>
                            </>
                          )}

                          {tanda.estado === 'en_proceso' && !isConfirming && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isProcessing}
                                onClick={() => setConfirmingId(tanda.id)}
                              >
                                Completar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={isProcessing}
                                onClick={() => runAction(tanda.id, cancelarTanda)}
                              >
                                Cancelar
                              </Button>
                            </>
                          )}

                          {isConfirming && (
                            <>
                              <span className="text-xs text-muted-foreground mr-1">
                                ¿Descontar stock?
                              </span>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isProcessing}
                                onClick={() => runAction(tanda.id, completarTanda)}
                              >
                                {isProcessing ? 'Procesando…' : 'Confirmar'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                disabled={isProcessing}
                                onClick={() => setConfirmingId(null)}
                              >
                                No
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {error && (
                      <TableRow className="border-0">
                        <TableCell colSpan={5} className="pt-0 pb-2">
                          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {error}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreateTandaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        recetas={recetasProduccion}
      />
    </div>
  );
}
