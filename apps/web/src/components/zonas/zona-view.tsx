'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingBasket, ClipboardList, PackageCheck, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ZONA_CHANNEL } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import {
  getPedidosZona,
  getPedidosTurnoZona,
  entregarPedido,
  cancelarPedido,
} from '@/modules/orders/actions';
import type { CartaElaboracion } from '@/modules/orders/actions';
import { getTandasDisponiblesZona } from '@/modules/production/actions';
import type { PedidoWithItems, ZonaServicio } from '@/modules/orders/domain/pedido';
import type { Tanda } from '@/modules/production/domain/tanda';
import type { SocketEvent } from '@dorado/shared-types';
import { Button } from '@/components/ui/button';
import { CreatePedidoZonaDialog } from './create-pedido-zona-dialog';

type Tab = 'pedidos' | 'disponibilidad' | 'turno';

interface ZonaViewProps {
  zona: ZonaServicio;
  titulo: string;
  elaboraciones: CartaElaboracion[];
  initialPedidos: PedidoWithItems[];
  initialTandas: Tanda[];
  initialTurnoPedidos: PedidoWithItems[];
}

export function ZonaView({
  zona,
  titulo,
  elaboraciones,
  initialPedidos,
  initialTandas,
  initialTurnoPedidos,
}: ZonaViewProps) {
  const t = useTranslations('zonaView');
  const tPedidos = useTranslations('pedidos');

  const [tab, setTab] = useState<Tab>('pedidos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const [tandas, setTandas] = useState<Tanda[]>(initialTandas);
  const [turnoPedidos, setTurnoPedidos] = useState<PedidoWithItems[]>(initialTurnoPedidos);

  const socket = useSocket();
  const channel = ZONA_CHANNEL[zona];

  const refresh = useCallback(async () => {
    const [pedidosResult, tandasResult, turnoResult] = await Promise.all([
      getPedidosZona(zona),
      getTandasDisponiblesZona(zona),
      getPedidosTurnoZona(zona),
    ]);
    if (pedidosResult.ok) setPedidos(pedidosResult.value);
    if (tandasResult.ok) setTandas(tandasResult.value);
    if (turnoResult.ok) setTurnoPedidos(turnoResult.value);
  }, [zona]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', channel);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_CREADO' || event.type === 'PEDIDO_ESTADO') {
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

  // Mapa de labels de estado reutilizando claves existentes del namespace pedidos
  const estadoLabels: Record<string, string> = useMemo(
    () => ({
      creado: tPedidos('estadoCreado'),
      recibido_cocina: tPedidos('estadoRecibidoCocina'),
      en_preparacion: tPedidos('estadoEnPreparacion'),
      despachado: tPedidos('estadoDespachado'),
      entregado: tPedidos('estadoEntregado'),
      cancelado: tPedidos('estadoCancelado'),
    }),
    [tPedidos],
  );

  const handleEntregar = async (p: PedidoWithItems) => {
    await entregarPedido(p.id, p.version);
    await refresh();
  };

  const handleCancelar = async (p: PedidoWithItems) => {
    await cancelarPedido(p.id, p.version);
    await refresh();
  };

  const handleCreated = async () => {
    setDialogOpen(false);
    setTab('pedidos');
    await refresh();
  };

  const minutosDesde = (date: Date) => Math.floor((Date.now() - date.getTime()) / 60_000);

  const formatItems = (p: PedidoWithItems) =>
    p.items.map((it) => `${it.cantidad}× ${it.recetaNombre}`).join(' · ');

  // Métricas del turno
  const turnoMetrics = useMemo(() => {
    const total = turnoPedidos.length;
    const entregados = turnoPedidos.filter((p) => p.estado === 'entregado');
    const tiempos = entregados
      .map((p) => {
        const entregadoAt = p.timestamps.entregadoAt;
        if (!entregadoAt) return null;
        return Math.floor((entregadoAt.getTime() - p.createdAt.getTime()) / 60_000);
      })
      .filter((n): n is number => n !== null);
    const promedio =
      tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;
    return { total, entregados: entregados.length, promedio };
  }, [turnoPedidos]);

  const tabs: { key: Tab; label: string; icon: typeof ShoppingBasket }[] = [
    { key: 'pedidos', label: t('tabPedidos'), icon: ClipboardList },
    { key: 'disponibilidad', label: t('tabDisponibilidad'), icon: PackageCheck },
    { key: 'turno', label: t('tabTurno'), icon: History },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitulo')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <ShoppingBasket className="h-4 w-4 mr-1.5" />
          {t('nuevoPedido')}
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
              key !== tabs[0]!.key && 'border-l border-border',
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Pedidos activos */}
      {tab === 'pedidos' && (
        <div className="space-y-3">
          {pedidos.length === 0 ? (
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed text-sm text-muted-foreground">
              {t('sinPedidos')}
            </div>
          ) : (
            pedidos.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">{formatItems(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {estadoLabels[p.estado] ?? p.estado}
                      {' · '}
                      {t('haceMinutos', { n: minutosDesde(p.createdAt) })}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {p.estado === 'despachado' && (
                      <Button size="sm" onClick={() => handleEntregar(p)}>
                        {t('confirmarEntrega')}
                      </Button>
                    )}
                    {p.estado === 'creado' && (
                      <Button size="sm" variant="outline" onClick={() => handleCancelar(p)}>
                        {t('cancelarPedido')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Disponibilidad */}
      {tab === 'disponibilidad' && (
        <div className="space-y-3">
          {tandas.length === 0 ? (
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed text-sm text-muted-foreground">
              {t('sinTandas')}
            </div>
          ) : (
            tandas.map((tanda) => (
              <div
                key={tanda.id}
                className="rounded-lg border border-border p-4 flex items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{tanda.recetaNombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('colTandas')}: {tanda.cantidadTandas}
                    {tanda.completedAt && (
                      <>
                        {' · '}
                        {tanda.completedAt.toLocaleTimeString()}
                      </>
                    )}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Mi turno */}
      {tab === 'turno' && (
        <div className="space-y-4">
          {/* Métricas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{turnoMetrics.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('metricaPedidosTurno')}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{turnoMetrics.entregados}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('metricaEntregados')}</p>
            </div>
            <div className="rounded-lg border border-border p-4 text-center">
              <p className="text-2xl font-bold">{t('minutos', { n: turnoMetrics.promedio })}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('metricaTiempoPromedio')}</p>
            </div>
          </div>

          {/* Historial */}
          <div className="space-y-2">
            {turnoPedidos.length === 0 ? (
              <div className="flex items-center justify-center h-24 rounded-lg border border-dashed text-sm text-muted-foreground">
                {t('sinHistorial')}
              </div>
            ) : (
              turnoPedidos.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border p-3 flex items-center justify-between gap-2"
                >
                  <p className="text-sm truncate min-w-0">{formatItems(p)}</p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {estadoLabels[p.estado] ?? p.estado}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Diálogo de nuevo pedido */}
      <CreatePedidoZonaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
        zona={zona}
        elaboraciones={elaboraciones}
      />
    </div>
  );
}
