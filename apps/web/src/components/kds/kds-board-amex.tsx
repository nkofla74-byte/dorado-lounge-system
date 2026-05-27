'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Clock,
  ChefHat,
  Truck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CHANNELS } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import {
  getPedidosAmexKds as getPedidosAmex,
  recibirPedidoAmex as recibirEnCocina,
  iniciarPreparacionAmex as iniciarPreparacion,
  despacharPedidoAmex as despacharPedido,
  getEventosPedidoAmex as getEventosPedido,
} from '@/modules/cocina-amex/actions';
import { toast } from 'sonner';
import type { PedidoWithItems, PedidoEvento } from '@/modules/orders/domain/pedido';
import type { SocketEvent } from '@dorado/shared-types';

type EstadoEventoKey =
  | 'creado'
  | 'recibido_cocina'
  | 'en_preparacion'
  | 'despachado'
  | 'entregado'
  | 'cancelado';

function formatHora(d: Date): string {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const URGENCY_WARN_MINS = 8;
const URGENCY_CRIT_MINS = 15;

function useElapsed(since: Date): { label: string; mins: number } {
  const calc = () => {
    const secs = Math.floor((Date.now() - since.getTime()) / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return { label: mins < 1 ? `${secs}s` : `${mins}m ${s.toString().padStart(2, '0')}s`, mins };
  };

  const [state, setState] = useState(calc);

  useEffect(() => {
    setState(calc());
    const id = setInterval(() => setState(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since]);

  return state;
}

const ESTADO_ORDER: Record<string, number> = {
  creado: 0,
  recibido_cocina: 1,
  en_preparacion: 2,
  despachado: 3,
};

interface AmexCardProps {
  pedido: PedidoWithItems;
  onRefresh: () => void;
  onOptimistic: (id: string, estado: string) => void;
  readOnly?: boolean | undefined;
}

function AmexCard({ pedido, onRefresh, onOptimistic, readOnly }: AmexCardProps) {
  const t = useTranslations('kds');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [eventos, setEventos] = useState<PedidoEvento[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const since = pedido.estado === 'en_preparacion' ? pedido.updatedAt : pedido.createdAt;
  const { label: elapsed, mins } = useElapsed(since);

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && eventos === null) {
      setLoadingHistory(true);
      const r = await getEventosPedido(pedido.id);
      if (r.ok) setEventos(r.value);
      setLoadingHistory(false);
    }
  };

  const isCrit = mins >= URGENCY_CRIT_MINS && pedido.estado !== 'despachado';
  const isWarn = mins >= URGENCY_WARN_MINS && !isCrit && pedido.estado !== 'despachado';

  async function run<T>(
    action: () => Promise<{ ok: boolean; value?: T; error?: { message: string; code?: string } }>,
    nuevoEstado: string,
  ) {
    setLoading(true);
    const result = await action();
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error?.message ?? 'Error');
      if (result.error?.code === 'VERSION_CONFLICT') onRefresh();
      return;
    }
    onOptimistic(pedido.id, nuevoEstado);
  }

  const cardBorder = isCrit
    ? 'ring-2 ring-red-500 animate-pulse'
    : isWarn
      ? 'ring-2 ring-amber-500'
      : '';

  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-3 shadow-sm transition-all ${cardBorder}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-semibold text-sm leading-tight">
            {pedido.numeroMesa ?? <span className="text-muted-foreground">{t('sinMesa')}</span>}
          </p>
          <Badge
            variant="outline"
            className={`text-xs ${isCrit ? 'border-red-500 text-red-500' : isWarn ? 'border-amber-500 text-amber-500' : ''}`}
          >
            {pedido.estado === 'creado' && t('estadoNuevo')}
            {pedido.estado === 'recibido_cocina' && t('estadoRecibido')}
            {pedido.estado === 'en_preparacion' && t('estadoPreparando')}
            {pedido.estado === 'despachado' && t('estadoDespachado')}
          </Badge>
        </div>
        <div
          className={`flex items-center gap-1 text-xs shrink-0 ${isCrit ? 'text-red-500 font-bold' : isWarn ? 'text-amber-500' : 'text-muted-foreground'}`}
        >
          {isCrit ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3 w-3" />}
          <span className="font-mono tabular-nums">{elapsed}</span>
        </div>
      </div>

      {/* Ítems */}
      <ul className="space-y-1">
        {pedido.items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-medium">{item.cantidad}×</span> {item.recetaNombre}
            {item.notas && (
              <p className="text-xs text-muted-foreground ml-4 italic">↳ {item.notas}</p>
            )}
          </li>
        ))}
      </ul>

      {pedido.notas && (
        <p className="text-xs text-muted-foreground border-t pt-2 italic">{pedido.notas}</p>
      )}

      {/* Acciones */}
      {!readOnly && (
        <div className="pt-1 flex flex-col gap-1.5">
          {pedido.estado === 'creado' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() =>
                run(() => recibirEnCocina(pedido.id, pedido.version), 'recibido_cocina')
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {t('recibirCocina')}
            </Button>
          )}
          {pedido.estado === 'recibido_cocina' && (
            <Button
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={() =>
                run(() => iniciarPreparacion(pedido.id, pedido.version), 'en_preparacion')
              }
            >
              <ChefHat className="h-4 w-4 mr-1.5" />
              {t('iniciarPrep')}
            </Button>
          )}
          {pedido.estado === 'en_preparacion' && (
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={loading}
              onClick={() => run(() => despacharPedido(pedido.id, pedido.version), 'despachado')}
            >
              <Truck className="h-4 w-4 mr-1.5" />
              {t('despachar')}
            </Button>
          )}
          {pedido.estado === 'despachado' && (
            <Badge variant="outline" className="w-full justify-center py-1.5 text-xs">
              {t('esperandoMesero')}
            </Badge>
          )}
        </div>
      )}

      {/* Historia de trazabilidad */}
      <div className="border-t border-border/50 pt-2">
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={toggleHistory}
        >
          {loadingHistory ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <History className="h-3 w-3" />
          )}
          <span>{t('historial')}</span>
          {showHistory ? (
            <ChevronUp className="h-3 w-3 ml-auto" />
          ) : (
            <ChevronDown className="h-3 w-3 ml-auto" />
          )}
        </button>
        {showHistory && (
          <div className="mt-2 space-y-1.5">
            {eventos === null || loadingHistory ? (
              <p className="text-xs text-muted-foreground pl-3">{t('cargando')}</p>
            ) : eventos.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-3">{t('sinEventos')}</p>
            ) : (
              eventos.map((ev, idx) => (
                <div key={ev.id} className="flex gap-2 text-xs">
                  <div className="flex flex-col items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 shrink-0" />
                    {idx < eventos.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-0.5 min-h-[8px]" />
                    )}
                  </div>
                  <div className="pb-1.5">
                    <p className="font-medium text-foreground leading-tight">
                      {t.has(`evento.${ev.estado}`)
                        ? t(`evento.${ev.estado as EstadoEventoKey}`)
                        : ev.estado}
                    </p>
                    <p className="text-muted-foreground">
                      {formatHora(ev.createdAt)}
                      {ev.actorNombre && ` · ${ev.actorNombre}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface KdsBoardAmexProps {
  initialPedidos: PedidoWithItems[];
  readOnly?: boolean | undefined;
}

export function KdsBoardAmex({ initialPedidos, readOnly }: KdsBoardAmexProps) {
  const t = useTranslations('kds');
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const [refreshing, setRefreshing] = useState(false);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const result = await getPedidosAmex();
    if (result.ok) setPedidos(result.value);
    setRefreshing(false);
  }, []);

  const handleOptimistic = useCallback((pedidoId: string, nuevoEstado: string) => {
    if (nuevoEstado === 'entregado' || nuevoEstado === 'cancelado') {
      setPedidos((prev) => prev.filter((p) => p.id !== pedidoId));
    } else {
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
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.COCINA_AMEX);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_CREADO' && event.payload.zona === 'amex') {
        refresh();
        toast.info(t('nuevoPedidoAmexToast', { mesa: event.payload.numeroMesa ?? 'none' }));
      }
      if (event.type === 'PEDIDO_ESTADO' && event.payload.zona === 'amex') {
        const { pedidoId, estadoNuevo } = event.payload;
        if (estadoNuevo === 'entregado' || estadoNuevo === 'cancelado') {
          setPedidos((prev) => {
            if (estadoNuevo === 'cancelado') {
              const p = prev.find((x) => x.id === pedidoId);
              toast.warning(t('canceladoToast', { mesa: p?.numeroMesa ?? 'none' }));
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
      socket.emit('leave', CHANNELS.COCINA_AMEX);
    };
  }, [socket, refresh, t]);

  const sorted = [...pedidos].sort((a, b) => {
    const estadoDiff = (ESTADO_ORDER[a.estado] ?? 0) - (ESTADO_ORDER[b.estado] ?? 0);
    if (estadoDiff !== 0) return estadoDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const total = pedidos.length;
  const urgentes = pedidos.filter(
    (p) =>
      p.estado !== 'despachado' &&
      (Date.now() - p.createdAt.getTime()) / 60000 >= URGENCY_CRIT_MINS,
  ).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('tituloAmex')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total === 0 ? t('sinPedidosActivos') : t('pedidosActivos', { n: total })}
            {urgentes > 0 && (
              <span className="ml-2 text-red-500 font-medium">
                · {t('urgentes', { n: urgentes })}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={refresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-lg border border-dashed text-muted-foreground text-sm">
          {t('sinPedidosAmex')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((pedido) => (
            <AmexCard
              key={pedido.id}
              pedido={pedido}
              onRefresh={refresh}
              onOptimistic={handleOptimistic}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
