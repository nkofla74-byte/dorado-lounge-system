'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Clock,
  ChefHat,
  RotateCcw,
  CheckCheck,
  UtensilsCrossed,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { iniciarItem, marcarItemListo, recallItem } from '@/modules/orders/actions';
import { toast } from 'sonner';
import type { PedidoWithItems, AreaProduccion } from '@/modules/orders/domain/pedido';

type ZonaKey = 'amex' | 'snack' | 'buffet';
type Urgencia = 'normal' | 'aviso' | 'critico';

// Tokens de estado en lugar de la paleta cruda de Tailwind: responden al tema
// y mantienen el contraste en claro y oscuro (dorado-design-system §4).
const ZONA_COLOR: Record<string, string> = {
  amex: 'bg-senal-curso/10 border-senal-curso/30 text-senal-curso',
  snack: 'bg-senal-aviso/10 border-senal-aviso/30 text-senal-aviso',
  buffet: 'bg-senal-ok/10 border-senal-ok/30 text-senal-ok',
};

const ITEM_ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-senal-aviso/10 text-senal-aviso border-senal-aviso/30',
  en_preparacion: 'bg-senal-curso/10 text-senal-curso border-senal-curso/30',
  listo: 'bg-senal-ok/10 text-senal-ok border-senal-ok/30',
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

function nivelUrgencia(since: Date, allListo: boolean): Urgencia {
  if (allListo) return 'normal';
  const mins = (Date.now() - since.getTime()) / 60000;
  if (mins > 15) return 'critico';
  if (mins > 8) return 'aviso';
  return 'normal';
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
  const urgencia = nivelUrgencia(urgencySince, allListo);

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
      className={cn(
        'rounded-xl border bg-card shadow-sm transition-colors duration-200 ease-smooth',
        urgencia === 'aviso' && 'border-senal-aviso/60 ring-1 ring-senal-aviso/40',
        urgencia === 'critico' && 'border-senal-critico ring-2 ring-senal-critico/60',
      )}
      aria-labelledby={`pedido-${pedido.id}-mesa`}
    >
      {/* Cabecera: mesa y cronómetro. El tiempo es el dato que el cocinero lee
          de reojo desde el pase, así que domina la jerarquía. */}
      <div className="flex items-start justify-between gap-4 p-4 pb-3">
        <div className="min-w-0 space-y-1.5">
          <p id={`pedido-${pedido.id}-mesa`} className="text-headline font-semibold leading-tight">
            {pedido.numeroMesa ? pedido.numeroMesa : t('sinMesa')}
          </p>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
              'text-caption font-medium',
              ZONA_COLOR[pedido.zona] ?? '',
            )}
          >
            <UtensilsCrossed className="size-3.5" aria-hidden="true" />
            {zonaLabel}
          </span>
        </div>

        <div
          className={cn(
            'flex shrink-0 flex-col items-end',
            urgencia === 'critico' ? 'text-senal-critico' : 'text-muted-foreground',
          )}
        >
          <span
            className="text-timer font-mono font-semibold tabular-nums"
            // El cronómetro avanza solo: se anuncia sin robar el foco al cocinero.
            aria-live="off"
            aria-label={t('tiempoTranscurrido', { tiempo: elapsed })}
          >
            {elapsed}
          </span>
          <span className="flex items-center gap-1 text-caption">
            <Clock className="size-3.5" aria-hidden="true" />
            {t('progresoArea', { n: readyCount, total: areaItems.length })}
          </span>
        </div>
      </div>

      {/* La demora nunca se comunica solo con color: icono + texto, porque hay
          cocineros daltónicos y pantallas de cocina mal calibradas. */}
      {urgencia !== 'normal' && (
        <p
          role="status"
          className={cn(
            'mx-4 mb-3 flex items-center gap-2 rounded-lg px-3 py-2',
            'text-caption font-semibold uppercase tracking-wide',
            urgencia === 'critico'
              ? 'bg-senal-critico/12 text-senal-critico motion-safe:animate-atencion'
              : 'bg-senal-aviso/12 text-senal-aviso',
          )}
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {urgencia === 'critico' ? t('urgenciaCritica') : t('urgenciaAviso')}
        </p>
      )}

      {/* Ítems del área */}
      <ul className="divide-y divide-border border-t">
        {areaItems.map((item) => {
          const isLoading = loadingItemId === item.id;
          return (
            <li key={item.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body leading-snug">
                    <span className="font-semibold tabular-nums">{item.cantidad}×</span>{' '}
                    <span>{item.recetaNombre}</span>
                  </p>
                  {/* Las notas llevan alergias e intolerancias. En 12 px, gris y
                      cursiva eran invisibles: aquí van marcadas y legibles. */}
                  {item.notas && (
                    <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-muted px-2 py-1 text-caption font-medium">
                      <span aria-hidden="true">↳</span>
                      <span>{item.notas}</span>
                    </p>
                  )}
                </div>

                {(readOnly || !area) && (
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 text-caption', ITEM_ESTADO_COLORS[item.estado] ?? '')}
                  >
                    {t(
                      `evento.${item.estado === 'pendiente' ? 'creado' : item.estado === 'en_preparacion' ? 'en_preparacion' : 'despachado'}`,
                    )}
                  </Badge>
                )}
              </div>

              {/* Objetivo táctil de 56 px y ancho completo: se pulsa con guantes,
                  con prisa y sin mirar. Antes eran botones de 28 px (h-7). */}
              {!readOnly && area && (
                <>
                  {item.estado === 'pendiente' && (
                    <Button
                      variant="outline"
                      className="min-h-14 w-full text-body"
                      disabled={isLoading}
                      onClick={() => handleItemAction(item.id, (id, v) => iniciarItem(id, v))}
                    >
                      <ChefHat className="mr-2 size-5" aria-hidden="true" />
                      {t('iniciarItem')}
                    </Button>
                  )}
                  {item.estado === 'en_preparacion' && (
                    <Button
                      className="min-h-14 w-full text-body"
                      disabled={isLoading}
                      onClick={() => handleItemAction(item.id, (id, v) => marcarItemListo(id, v))}
                    >
                      <CheckCheck className="mr-2 size-5" aria-hidden="true" />
                      {t('marcarListo')}
                    </Button>
                  )}
                  {item.estado === 'listo' && (
                    <Button
                      variant="ghost"
                      className="min-h-14 w-full text-body text-senal-ok"
                      disabled={isLoading}
                      onClick={() => handleItemAction(item.id, (id, v) => recallItem(id, v))}
                    >
                      <RotateCcw className="mr-2 size-5" aria-hidden="true" />
                      {t('recall')}
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Ítems de otras áreas — contexto, no acción */}
      {area && pedido.items.filter((i) => i.areaProduccion !== area).length > 0 && (
        <div className="border-t bg-muted/40 p-4">
          <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground">
            {t('otrasAreas')}
          </p>
          <ul className="space-y-1.5">
            {pedido.items
              .filter((i) => i.areaProduccion !== area)
              .map((item) => (
                <li key={item.id} className="text-caption text-muted-foreground">
                  <span className="font-semibold tabular-nums">{item.cantidad}×</span>{' '}
                  <span>{item.recetaNombre}</span>
                  {item.notas && <p className="ml-4">↳ {item.notas}</p>}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Notas del pedido */}
      {pedido.notas && (
        <p className="border-t bg-muted/40 p-4 text-caption font-medium">{pedido.notas}</p>
      )}
    </div>
  );
}
