'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CHANNELS } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import { PedidoCard } from './pedido-card';
import { estadoAreaDePedido } from './area-estado';
import { getPedidosByArea } from '@/modules/orders/actions';
import type { PedidoWithItems, AreaProduccion } from '@/modules/orders/domain/pedido';
import type { SocketEvent } from '@dorado/shared-types';

interface ColumnDef {
  key: 'creado' | 'en_preparacion' | 'despachado';
  labelKey: 'colNuevos' | 'colEnPreparacion' | 'colDespachados';
  emptyKey: 'emptyNuevos' | 'emptyPreparacion' | 'emptyDespachados';
  headerClass: string;
  countClass: string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'creado',
    labelKey: 'colNuevos',
    emptyKey: 'emptyNuevos',
    headerClass: 'border-amber-500/40 bg-amber-500/5',
    countClass: 'bg-amber-500 text-white',
  },
  {
    key: 'en_preparacion',
    labelKey: 'colEnPreparacion',
    emptyKey: 'emptyPreparacion',
    headerClass: 'border-blue-500/40 bg-blue-500/5',
    countClass: 'bg-blue-500 text-white',
  },
  {
    key: 'despachado',
    labelKey: 'colDespachados',
    emptyKey: 'emptyDespachados',
    headerClass: 'border-emerald-500/40 bg-emerald-500/5',
    countClass: 'bg-emerald-500 text-white',
  },
];

interface KdsBoardAreaProps {
  area: AreaProduccion;
  titulo: string;
  subtitulo: string;
  initialPedidos: PedidoWithItems[];
  readOnly?: boolean | undefined;
}

/**
 * KDS enfocado por área productiva (cocina fría / caliente). Muestra solo los
 * pedidos con ítems ruteados a esta área. Escucha el canal COCINA (donde se
 * difunden PEDIDO_CREADO / PEDIDO_ESTADO / ITEM_ESTADO) y recarga la cola del área.
 *
 * La columna de cada pedido se determina por el estado de sus ítems en esta área
 * (via estadoAreaDePedido), no por el estado global del pedido.
 */
export function KdsBoardArea({
  area,
  titulo,
  subtitulo,
  initialPedidos,
  readOnly,
}: KdsBoardAreaProps) {
  const t = useTranslations('kds');
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    const result = await getPedidosByArea(area);
    if (result.ok) setPedidos(result.value);
  }, [area]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.COCINA);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_CREADO') {
        refresh();
      }
      if (event.type === 'PEDIDO_ESTADO') {
        const { pedidoId, estadoNuevo } = event.payload;
        if (estadoNuevo === 'entregado' || estadoNuevo === 'cancelado') {
          setPedidos((prev) => prev.filter((p) => p.id !== pedidoId));
        } else {
          // Puede ser un pedido nuevo para esta área o un cambio de estado: recargar.
          refresh();
        }
      }
      if (event.type === 'ITEM_ESTADO') {
        // Un ítem de algún pedido cambió de estado — recargar para reflejar
        // el nuevo estado del ítem y la clasificación de columna.
        refresh();
      }
    };

    socket.on('event', handleEvent);
    socket.on('connect', refresh);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', CHANNELS.COCINA);
    };
  }, [socket, refresh]);

  const byState = (estado: ColumnDef['key']) =>
    pedidos
      .filter((p) => estadoAreaDePedido(p, area) === estado)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pedidos.length === 0 ? subtitulo : t('pedidosActivos', { n: pedidos.length })}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('actualizar')}
        </button>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {COLUMNS.map((col) => {
          const items = byState(col.key);
          return (
            <div key={col.key} className="space-y-3">
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.headerClass}`}
              >
                <span className="font-medium text-sm">{t(col.labelKey)}</span>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${col.countClass}`}>
                  {items.length}
                </span>
              </div>

              <div className="space-y-3 min-h-[120px]">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-24 rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t(col.emptyKey)}
                  </div>
                ) : (
                  items.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      area={area}
                      pedidoVersion={pedido.version}
                      onRefresh={refresh}
                      readOnly={readOnly}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
