'use client';

import { useState, useEffect, useCallback } from 'react';
import { CHANNELS } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import { PedidoCard } from './pedido-card';
import { getPedidos } from '@/modules/orders/actions';
import { toast } from 'sonner';
import type { PedidoWithItems } from '@/modules/orders/domain/pedido';
import type { SocketEvent } from '@dorado/shared-types';

interface Column {
  key: 'creado' | 'en_preparacion' | 'despachado';
  label: string;
  emptyText: string;
  headerClass: string;
  countClass: string;
}

const COLUMNS: Column[] = [
  {
    key: 'creado',
    label: 'Nuevos',
    emptyText: 'Sin pedidos nuevos',
    headerClass: 'border-amber-500/40 bg-amber-500/5',
    countClass: 'bg-amber-500 text-white',
  },
  {
    key: 'en_preparacion',
    label: 'En preparación',
    emptyText: 'Nada en cocina',
    headerClass: 'border-blue-500/40 bg-blue-500/5',
    countClass: 'bg-blue-500 text-white',
  },
  {
    key: 'despachado',
    label: 'Despachados',
    emptyText: 'Nada esperando entrega',
    headerClass: 'border-emerald-500/40 bg-emerald-500/5',
    countClass: 'bg-emerald-500 text-white',
  },
];

const ZONA_TABS = [
  { key: null, label: 'Todas' },
  { key: 'snack', label: 'Snack' },
  { key: 'buffet', label: 'Buffet' },
  { key: 'amex', label: 'Amex' },
] as const;

type ZonaFiltro = null | 'snack' | 'buffet' | 'amex';

interface KdsBoardProps {
  initialPedidos: PedidoWithItems[];
}

export function KdsBoard({ initialPedidos }: KdsBoardProps) {
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const [zonaFiltro, setZonaFiltro] = useState<ZonaFiltro>(null);
  const socket = useSocket();

  // Refresca toda la lista desde el servidor (post-state-change o reconexión)
  const refresh = useCallback(async () => {
    const result = await getPedidos();
    if (result.ok) setPedidos(result.value);
  }, []);

  // Actualización optimista de estado al hacer clic en un botón
  const handleStateChange = useCallback((pedidoId: string, nuevoEstado: string) => {
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedidoId
          ? {
              ...p,
              estado: nuevoEstado as PedidoWithItems['estado'],
              version: p.version + 1,
              updatedAt: new Date(),
            }
          : p,
      ),
    );
  }, []);

  // Socket: suscribir a COCINA para PEDIDO_CREADO y PEDIDO_ESTADO
  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.COCINA);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_CREADO') {
        // El evento tiene info básica; hacemos refresh para obtener el objeto completo
        refresh();
        toast.info(`Nuevo pedido — ${event.payload.zona} ${event.payload.numeroMesa ?? ''}`);
      }
      if (event.type === 'PEDIDO_ESTADO') {
        const { pedidoId, estadoNuevo } = event.payload;
        if (estadoNuevo === 'entregado' || estadoNuevo === 'cancelado') {
          setPedidos((prev) => {
            if (estadoNuevo === 'cancelado') {
              const p = prev.find((x) => x.id === pedidoId);
              toast.warning(`Pedido cancelado${p?.numeroMesa ? ` — ${p.numeroMesa}` : ''}`);
            }
            return prev.filter((p) => p.id !== pedidoId);
          });
        } else {
          setPedidos((prev) =>
            prev.map((p) =>
              p.id === pedidoId
                ? { ...p, estado: estadoNuevo, version: p.version + 1, updatedAt: new Date() }
                : p,
            ),
          );
        }
      }
    };

    socket.on('event', handleEvent);

    // Refrescar en reconexión
    socket.on('connect', refresh);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', CHANNELS.COCINA);
    };
  }, [socket, refresh]);

  const pedidosFiltrados = zonaFiltro ? pedidos.filter((p) => p.zona === zonaFiltro) : pedidos;

  const byState = (estado: Column['key']) =>
    pedidosFiltrados
      .filter((p) => p.estado === estado)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const total = pedidosFiltrados.length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cocina — KDS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total === 0
              ? 'Sin pedidos activos'
              : `${total} pedido${total > 1 ? 's' : ''} activo${total > 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Filtro por zona */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ZONA_TABS.map((tab) => (
          <button
            key={String(tab.key)}
            onClick={() => setZonaFiltro(tab.key as ZonaFiltro)}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              zonaFiltro === tab.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
            {tab.key !== null && (
              <span className="ml-1.5 tabular-nums">
                ({pedidos.filter((p) => p.zona === tab.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {COLUMNS.map((col) => {
          const items = byState(col.key);
          return (
            <div key={col.key} className="space-y-3">
              {/* Column header */}
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${col.headerClass}`}
              >
                <span className="font-medium text-sm">{col.label}</span>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${col.countClass}`}>
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-3 min-h-[120px]">
                {items.length === 0 ? (
                  <div className="flex items-center justify-center h-24 rounded-lg border border-dashed text-sm text-muted-foreground">
                    {col.emptyText}
                  </div>
                ) : (
                  items.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      onStateChange={handleStateChange}
                      onRefresh={refresh}
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
