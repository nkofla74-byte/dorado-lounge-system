'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CHANNELS } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import { PedidoCard } from './pedido-card';
import { getPedidos } from '@/modules/orders/actions';
import { toast } from 'sonner';
import type { PedidoWithItems } from '@/modules/orders/domain/pedido';
import type { SocketEvent } from '@dorado/shared-types';

type ZonaFiltro = null | 'snack' | 'buffet' | 'amex';

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

const ZONA_KEYS: ZonaFiltro[] = [null, 'snack', 'buffet', 'amex'];

interface KdsBoardProps {
  initialPedidos: PedidoWithItems[];
}

export function KdsBoard({ initialPedidos }: KdsBoardProps) {
  const t = useTranslations('kds');
  const tZ = useTranslations('zonas');
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const [zonaFiltro, setZonaFiltro] = useState<ZonaFiltro>(null);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    const result = await getPedidos();
    if (result.ok) setPedidos(result.value);
  }, []);

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

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.COCINA);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_CREADO') {
        refresh();
        const zona = tZ.has(event.payload.zona)
          ? tZ(event.payload.zona as 'amex' | 'snack' | 'buffet')
          : event.payload.zona;
        toast.info(t('nuevoPedidoToast', { zona, mesa: event.payload.numeroMesa ?? '' }));
      }
      if (event.type === 'PEDIDO_ESTADO') {
        const { pedidoId, estadoNuevo } = event.payload;
        if (estadoNuevo === 'entregado' || estadoNuevo === 'cancelado') {
          setPedidos((prev) => {
            if (estadoNuevo === 'cancelado') {
              const p = prev.find((x) => x.id === pedidoId);
              toast.warning(t('pedidoCanceladoToast', { mesa: p?.numeroMesa ?? 'none' }));
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
    socket.on('connect', refresh);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', CHANNELS.COCINA);
    };
  }, [socket, refresh, t, tZ]);

  const pedidosFiltrados = zonaFiltro ? pedidos.filter((p) => p.zona === zonaFiltro) : pedidos;

  const byState = (estado: ColumnDef['key']) =>
    pedidosFiltrados
      .filter((p) => p.estado === estado)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const total = pedidosFiltrados.length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('titulo')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total === 0 ? t('sinPedidosActivos') : t('pedidosActivos', { n: total })}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('actualizar')}
        </button>
      </div>

      {/* Filtro por zona */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ZONA_KEYS.map((tabKey) => (
          <button
            key={String(tabKey)}
            onClick={() => setZonaFiltro(tabKey)}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              zonaFiltro === tabKey
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:bg-accent hover:text-foreground',
            ].join(' ')}
          >
            {tabKey === null ? t('filtrosTodas') : tZ(tabKey)}
            {tabKey !== null && (
              <span className="ml-1.5 tabular-nums">
                ({pedidos.filter((p) => p.zona === tabKey).length})
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
