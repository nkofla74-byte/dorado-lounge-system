'use client';

import { Fragment, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingBag, AlertTriangle, Plus, RefreshCw } from 'lucide-react';
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
  getPedidos,
  iniciarPreparacion,
  despacharPedido,
  entregarPedido,
  cancelarPedido,
} from '@/modules/orders/actions';
import { CreatePedidoDialog } from './create-pedido-dialog';
import type { PedidoWithItems, Pedido, EstadoPedido } from '@/modules/orders/domain/pedido';
import type { RecetaWithIngredientes } from '@/modules/recipes/domain/recipe';
import type { UserRole } from '@dorado/shared-types';

const COCINA_ROLES = new Set<UserRole>(['superuser', 'admin', 'chef', 'sous_chef']);
const MESERO_ROLES = new Set<UserRole>(['superuser', 'admin', 'mesero_amex', 'recepcion']);
const CANCEL_ROLES = new Set<UserRole>([
  'superuser',
  'admin',
  'chef',
  'sous_chef',
  'mesero_amex',
  'recepcion',
]);

function EstadoBadge({ estado }: { estado: EstadoPedido }) {
  const t = useTranslations('pedidos');
  const base = 'text-xs font-medium';
  const ESTADO_LABEL: Record<EstadoPedido, string> = {
    creado: t('estadoCreado'),
    recibido_cocina: t('estadoRecibidoCocina'),
    en_preparacion: t('estadoEnPreparacion'),
    despachado: t('estadoDespachado'),
    entregado: t('estadoEntregado'),
    cancelado: t('estadoCancelado'),
  };
  if (estado === 'creado')
    return (
      <Badge
        className={cn(
          base,
          'bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20',
        )}
      >
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  if (estado === 'en_preparacion')
    return (
      <Badge
        className={cn(
          base,
          'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20',
        )}
      >
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  if (estado === 'despachado')
    return (
      <Badge
        className={cn(
          base,
          'bg-violet-500/15 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20',
        )}
      >
        {ESTADO_LABEL[estado]}
      </Badge>
    );
  return (
    <Badge variant="outline" className={cn(base, 'text-muted-foreground')}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

function ItemsSummary({ items }: { items: PedidoWithItems['items'] }) {
  const t = useTranslations('pedidos');
  if (items.length === 0)
    return <span className="text-muted-foreground text-xs">{t('sinItems')}</span>;
  const first = items[0]!;
  return (
    <span className="text-sm">
      {first.recetaNombre}
      {first.cantidad > 1 && <span className="text-muted-foreground"> ×{first.cantidad}</span>}
      {items.length > 1 && (
        <span className="text-muted-foreground text-xs ml-1">+{items.length - 1} más</span>
      )}
    </span>
  );
}

function formatElapsed(d: Date, ahoraLabel: string): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return ahoraLabel;
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

interface PedidoTableProps {
  initialData: PedidoWithItems[];
  recetas: RecetaWithIngredientes[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

type ActionFn = (
  id: string,
  version: number,
) => Promise<{ ok: boolean; value?: Pedido; error?: { message: string } }>;

export function PedidoTable({
  initialData,
  recetas,
  userRole,
  error: initialError,
}: PedidoTableProps) {
  const t = useTranslations('pedidos');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initialError);
  const [createOpen, setCreateOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const isCocina = userRole ? COCINA_ROLES.has(userRole) : false;
  const isMesero = userRole ? MESERO_ROLES.has(userRole) : false;
  const canCancel = userRole ? CANCEL_ROLES.has(userRole) : false;

  const refresh = async () => {
    setLoading(true);
    setFetchError(undefined);
    const result = await getPedidos();
    if (result.ok) setData(result.value);
    else setFetchError(result.error.message);
    setLoading(false);
  };

  const applyTransition = (updated: Pedido) => {
    if (updated.estado === 'entregado' || updated.estado === 'cancelado') {
      setData((prev) => prev.filter((p) => p.id !== updated.id));
    } else {
      setData((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
                ...p,
                estado: updated.estado,
                version: updated.version,
                updatedAt: updated.updatedAt,
              }
            : p,
        ),
      );
    }
  };

  const runAction = async (pedido: PedidoWithItems, action: ActionFn) => {
    setProcessingId(pedido.id);
    setRowError(null);
    const result = await action(pedido.id, pedido.version);
    if (result.ok && result.value) {
      applyTransition(result.value);
    } else {
      setRowError({ id: pedido.id, message: result.error?.message ?? 'Error desconocido' });
    }
    setProcessingId(null);
    setConfirmingId(null);
  };

  const recetasServicio = recetas.filter((r) => r.tipoReceta === 'servicio');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShoppingBag className="h-4 w-4" />
          <span>{t('pedidosActivos', { count: data.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={loading}
            aria-label={t('actualizarPedidos')}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {isMesero && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t('nuevoPedido')}
            </Button>
          )}
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
              <TableHead>{t('colMesa')}</TableHead>
              <TableHead>{t('colZona')}</TableHead>
              <TableHead>{t('colEstado')}</TableHead>
              <TableHead>{t('colItems')}</TableHead>
              <TableHead>{t('colHace')}</TableHead>
              <TableHead className="text-right">{t('colAcciones')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  {t('sinPedidos')}
                </TableCell>
              </TableRow>
            ) : (
              data.map((pedido) => {
                const isProcessing = processingId === pedido.id;
                const isConfirming = confirmingId === pedido.id;
                const rowErr = rowError?.id === pedido.id ? rowError.message : null;

                return (
                  <Fragment key={pedido.id}>
                    <TableRow className="border-border">
                      <TableCell className="font-medium">
                        {pedido.numeroMesa ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {pedido.zona}
                        </span>
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={pedido.estado} />
                      </TableCell>
                      <TableCell>
                        <ItemsSummary items={pedido.items} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatElapsed(pedido.createdAt, t('ahora'))}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* creado: cocina inicia, todos pueden cancelar */}
                          {pedido.estado === 'creado' && !isConfirming && (
                            <>
                              {isCocina && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    runAction(pedido, (id, v) => iniciarPreparacion(id, v))
                                  }
                                >
                                  {t('iniciarPrep')}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    runAction(pedido, (id, v) => cancelarPedido(id, v))
                                  }
                                >
                                  {t('cancelar')}
                                </Button>
                              )}
                            </>
                          )}

                          {/* en_preparacion: cocina despacha o cancela */}
                          {pedido.estado === 'en_preparacion' && !isConfirming && (
                            <>
                              {isCocina && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    runAction(pedido, (id, v) => despacharPedido(id, v))
                                  }
                                >
                                  {t('despachar')}
                                </Button>
                              )}
                              {isCocina && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-muted-foreground"
                                  disabled={isProcessing}
                                  onClick={() =>
                                    runAction(pedido, (id, v) => cancelarPedido(id, v))
                                  }
                                >
                                  {t('cancelar')}
                                </Button>
                              )}
                            </>
                          )}

                          {/* despachado: mesero confirma entrega (con stock) */}
                          {pedido.estado === 'despachado' && !isConfirming && isMesero && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={isProcessing}
                              onClick={() => setConfirmingId(pedido.id)}
                            >
                              {t('confirmarEntrega')}
                            </Button>
                          )}

                          {/* Confirmación de entrega (descuenta stock) */}
                          {isConfirming && (
                            <>
                              <span className="text-xs text-muted-foreground mr-1">
                                {t('confirmarDescuento')}
                              </span>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={isProcessing}
                                onClick={() => runAction(pedido, (id, v) => entregarPedido(id, v))}
                              >
                                {isProcessing ? t('procesando') : t('confirmar')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                disabled={isProcessing}
                                onClick={() => setConfirmingId(null)}
                              >
                                {t('no')}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {rowErr && (
                      <TableRow className="border-0">
                        <TableCell colSpan={6} className="pt-0 pb-2">
                          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {rowErr}
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

      <CreatePedidoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          refresh();
        }}
        recetas={recetasServicio}
        defaultZona="amex"
      />
    </div>
  );
}
