'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, ChefHat, RotateCcw, CheckCheck, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { iniciarItem, marcarItemListo, recallItem } from '@/modules/orders/actions';
import { toast } from 'sonner';
import type { PedidoWithItems, AreaProduccion } from '@/modules/orders/domain/pedido';

type ZonaKey = 'amex' | 'snack' | 'buffet';

const ZONA_COLOR: Record<string, string> = {
  amex: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300',
  snack: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
  buffet: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
};

const ITEM_ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  en_preparacion: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  listo: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

function useElapsed(since: Date): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function calc() {
      const secs = Math.floor((Date.now() - since.getTime()) / 1000);
      if (secs < 60) return `${secs}s`;
      const mins = Math.floor(secs / 60);
      const s = secs % 60;
      return `${mins}m ${s.toString().padStart(2, '0')}s`;
    }
    setElapsed(calc());
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [since]);

  return elapsed;
}

/**
 * Returns the "urgency start" date for the area's items:
 * the oldest non-listo item's effective start, or createdAt as fallback.
 */
function areaUrgencySince(pedido: PedidoWithItems, areaItems: PedidoWithItems['items']): Date {
  const active = areaItems.filter((i) => i.estado !== 'listo');
  if (active.length === 0) return pedido.createdAt;
  // Use earliest enPreparacionAt if any, else createdAt
  const earliest = active.reduce<Date>((best, i) => {
    const ref = i.enPreparacionAt ?? pedido.createdAt;
    return ref < best ? ref : best;
  }, active[0]!.enPreparacionAt ?? pedido.createdAt);
  return earliest;
}

function urgencyClass(since: Date, allListo: boolean): string {
  if (allListo) return '';
  const mins = (Date.now() - since.getTime()) / 60000;
  if (mins > 15) return 'ring-2 ring-red-500 animate-pulse';
  if (mins > 8) return 'ring-2 ring-amber-500';
  return '';
}

interface PedidoCardProps {
  pedido: PedidoWithItems;
  /** Production area to filter and act on. When omitted, all items are shown read-only. */
  area?: AreaProduccion;
  pedidoVersion?: number;
  onRefresh?: () => void;
  readOnly?: boolean | undefined;
}

export function PedidoCard({ pedido, area, pedidoVersion, onRefresh, readOnly }: PedidoCardProps) {
  const t = useTranslations('kds');
  const tZ = useTranslations('zonas');
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  // When area is provided, show only items for that area; otherwise show all items (read-only).
  const areaItems = area ? pedido.items.filter((i) => i.areaProduccion === area) : pedido.items;
  const allListo = areaItems.length > 0 && areaItems.every((i) => i.estado === 'listo');
  const readyCount = areaItems.filter((i) => i.estado === 'listo').length;

  const urgencySince = areaUrgencySince(pedido, areaItems);
  const elapsed = useElapsed(urgencySince);

  const handleItemAction = async (
    itemId: string,
    action: (id: string, v: number) => ReturnType<typeof iniciarItem>,
  ) => {
    setLoadingItemId(itemId);
    // pedidoVersion is always defined when area is defined (buttons only shown with area).
    const res = await action(itemId, pedidoVersion ?? pedido.version);
    setLoadingItemId(null);
    if (!res.ok) {
      toast.error(res.error.message);
      if (res.error.code === 'VERSION_CONFLICT') onRefresh?.();
      return;
    }
    onRefresh?.();
  };

  const zonaLabel = tZ.has(pedido.zona) ? tZ(pedido.zona as ZonaKey) : pedido.zona;

  return (
    <div
      data-testid={`pedido-card-${pedido.id}`}
      className={`rounded-lg border bg-card p-4 space-y-3 shadow-sm transition-all ${urgencyClass(urgencySince, allListo)}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-semibold text-sm leading-tight">
            {pedido.numeroMesa ? pedido.numeroMesa : t('sinMesa')}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ZONA_COLOR[pedido.zona] ?? ''}`}
          >
            <UtensilsCrossed className="h-3 w-3" />
            {zonaLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-xs shrink-0">
          <Clock className="h-3 w-3" />
          <span className="font-mono tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Area progress */}
      {areaItems.length > 0 && (
        <p className="text-xs text-muted-foreground font-medium">
          {t('progresoArea', { n: readyCount, total: areaItems.length })}
        </p>
      )}

      {/* Items for this area */}
      <ul className="space-y-2">
        {areaItems.map((item) => {
          const isLoading = loadingItemId === item.id;
          return (
            <li key={item.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm min-w-0">
                  <span className="font-medium">{item.cantidad}×</span>{' '}
                  <span className="truncate">{item.recetaNombre}</span>
                  {item.notas && (
                    <p className="text-xs text-muted-foreground ml-4 italic">↳ {item.notas}</p>
                  )}
                </div>

                {readOnly || !area ? (
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 border ${ITEM_ESTADO_COLORS[item.estado] ?? ''}`}
                  >
                    {t(
                      `evento.${item.estado === 'pendiente' ? 'creado' : item.estado === 'en_preparacion' ? 'en_preparacion' : 'despachado'}`,
                    )}
                  </Badge>
                ) : (
                  <div className="shrink-0">
                    {item.estado === 'pendiente' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isLoading}
                        onClick={() => handleItemAction(item.id, (id, v) => iniciarItem(id, v))}
                      >
                        <ChefHat className="h-3 w-3 mr-1" />
                        {t('iniciarItem')}
                      </Button>
                    )}
                    {item.estado === 'en_preparacion' && (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={isLoading}
                        onClick={() => handleItemAction(item.id, (id, v) => marcarItemListo(id, v))}
                      >
                        <CheckCheck className="h-3 w-3 mr-1" />
                        {t('marcarListo')}
                      </Button>
                    )}
                    {item.estado === 'listo' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={isLoading}
                        onClick={() => handleItemAction(item.id, (id, v) => recallItem(id, v))}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t('recall')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Other items (not this area) shown read-only — only when area-specific view */}
      {area && pedido.items.filter((i) => i.areaProduccion !== area).length > 0 && (
        <ul className="space-y-1 border-t pt-2">
          {pedido.items
            .filter((i) => i.areaProduccion !== area)
            .map((item) => (
              <li key={item.id} className="text-sm text-muted-foreground">
                <span className="font-medium">{item.cantidad}×</span>{' '}
                <span>{item.recetaNombre}</span>
                {item.notas && <p className="text-xs ml-4 italic">↳ {item.notas}</p>}
              </li>
            ))}
        </ul>
      )}

      {/* Pedido notes */}
      {pedido.notas && (
        <p className="text-xs text-muted-foreground border-t pt-2 italic">{pedido.notas}</p>
      )}
    </div>
  );
}
