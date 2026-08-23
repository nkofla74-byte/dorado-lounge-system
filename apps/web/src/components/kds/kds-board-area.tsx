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
    headerClass: 'border-senal-aviso/40 bg-senal-aviso/5',
    countClass: 'bg-senal-aviso text-background',
  },
  {
    key: 'en_preparacion',
    labelKey: 'colEnPreparacion',
    emptyKey: 'emptyPreparacion',
    headerClass: 'border-senal-curso/40 bg-senal-curso/5',
    countClass: 'bg-senal-curso text-background',
  },
  {
    key: 'despachado',
    labelKey: 'colDespachados',
    emptyKey: 'emptyDespachados',
    headerClass: 'border-senal-ok/40 bg-senal-ok/5',
    countClass: 'bg-senal-ok text-background',
  },
];

// Canal que difunde los eventos de cada área. Fría/caliente comparten el canal
// genérico de cocina; pastelería tiene el suyo (su rol no integra sala:cocina).
const AREA_CHANNEL: Record<string, (typeof CHANNELS)[keyof typeof CHANNELS]> = {
  cocina_fria: CHANNELS.COCINA,
  cocina_caliente: CHANNELS.COCINA,
  pasteleria: CHANNELS.COCINA_PASTELERIA,
};

interface KdsBoardAreaProps {
  area: AreaProduccion;
  titulo: string;
  subtitulo: string;
  initialPedidos: PedidoWithItems[];
  readOnly?: boolean | undefined;
  // Embebido en otra página: sin padding exterior ni encabezado h1.
  embedded?: boolean | undefined;
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
  embedded,
}: KdsBoardAreaProps) {
  const t = useTranslations('kds');
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    const result = await getPedidosByArea(area);
    if (result.ok) setPedidos(result.value);
  }, [area]);

  const channel = AREA_CHANNEL[area] ?? CHANNELS.COCINA;

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', channel);

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
      socket.emit('leave', channel);
    };
  }, [socket, refresh, channel]);

  const byState = (estado: ColumnDef['key']) =>
    pedidos
      .filter((p) => estadoAreaDePedido(p, area) === estado)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className={embedded ? 'space-y-4' : 'p-6 space-y-4'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {embedded ? (
            <h2 className="text-title font-semibold">{titulo}</h2>
          ) : (
            <h1 className="text-display font-semibold tracking-tight">{titulo}</h1>
          )}
          <p className="text-body text-muted-foreground mt-1">
            {pedidos.length === 0 ? subtitulo : t('pedidosActivos', { n: pedidos.length })}
          </p>
        </div>
        <button
          onClick={refresh}
          className="min-h-14 rounded-lg px-4 text-body text-muted-foreground transition-colors duration-200 ease-smooth hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <span className="label-seccion">{t(col.labelKey)}</span>
                <span
                  className={`text-caption font-semibold rounded-full px-2.5 py-0.5 tabular-nums ${col.countClass}`}
                >
                  {items.length}
                </span>
              </div>

              <div className="space-y-3 min-h-[120px]">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-24 rounded-lg border border-dashed text-body text-muted-foreground">
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
