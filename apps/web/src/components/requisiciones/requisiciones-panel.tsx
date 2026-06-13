'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSocket } from '@/lib/socket/use-socket';
import {
  getColaAlmacen,
  getRequisicionesArea,
  alistarRequisicion,
  despacharRequisicion,
  confirmarRecibido,
} from '@/modules/requisiciones/actions';
import { CHANNELS } from '@dorado/shared-types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SocketEvent } from '@dorado/shared-types';
import type {
  RequisicionWithItems,
  AreaSolicitante,
  EstadoRequisicion,
} from '@/modules/requisiciones/domain/requisicion';

type Mode = 'almacen' | 'cocina';

interface RequisicionesPanelProps {
  mode: Mode;
  /** Requerido en modo cocina: el área del KDS. */
  area?: AreaSolicitante;
  initialRequisiciones: RequisicionWithItems[];
}

export function RequisicionesPanel({ mode, area, initialRequisiciones }: RequisicionesPanelProps) {
  const t = useTranslations('requisiciones.panel');
  const [requisiciones, setRequisiciones] = useState(initialRequisiciones);
  const [actionError, setActionError] = useState('');
  const socket = useSocket();

  const refresh = useCallback(async () => {
    const result = mode === 'almacen' ? await getColaAlmacen() : await getRequisicionesArea(area!);
    if (result.ok) setRequisiciones(result.value);
  }, [mode, area]);

  useEffect(() => {
    if (!socket) return;
    const channel = CHANNELS.ALMACEN;
    socket.emit('join', channel);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'REQUISICION_ESTADO') refresh();
    };
    socket.on('event', handleEvent);
    socket.on('connect', refresh);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', channel);
    };
  }, [socket, refresh]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    const result = await fn();
    setActionError(result.ok ? '' : (result.error?.message ?? ''));
    await refresh();
  };

  const handleAlistar = (r: RequisicionWithItems) => run(() => alistarRequisicion(r.id, r.version));

  const handleDespachar = (r: RequisicionWithItems) =>
    run(() =>
      despacharRequisicion({
        requisicionId: r.id,
        version: r.version,
        // Despacho total por defecto: cantidad despachada = solicitada.
        items: r.items.map((it) => ({ itemId: it.id, cantidadDespachada: it.cantidadSolicitada })),
      }),
    );

  const handleConfirmar = (r: RequisicionWithItems) =>
    run(() => confirmarRecibido(r.id, r.version));

  const estadoLabels: Record<EstadoRequisicion, string> = {
    solicitada: t('estadoSolicitada'),
    en_alistamiento: t('estadoEnAlistamiento'),
    despachada: t('estadoDespachada'),
    recibida: t('estadoRecibida'),
    cancelada: t('estadoCancelada'),
  };

  if (requisiciones.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('vacio')}</p>;
  }

  return (
    <div className="space-y-3">
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {requisiciones.map((r) => (
        <div key={r.id} className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{t(`area.${r.areaSolicitante}`)}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
              {estadoLabels[r.estado]}
            </span>
          </div>

          <ul className="text-sm text-muted-foreground space-y-0.5">
            {r.items.map((it) => (
              <li key={it.id}>
                {it.cantidadSolicitada} {it.unidad} · {it.insumoNombre}
              </li>
            ))}
          </ul>

          <div className="flex gap-2 pt-1">
            {mode === 'almacen' && r.estado === 'solicitada' && (
              <Button size="sm" variant="outline" onClick={() => handleAlistar(r)}>
                {t('accionAlistar')}
              </Button>
            )}
            {mode === 'almacen' && r.estado === 'en_alistamiento' && (
              <Button size="sm" onClick={() => handleDespachar(r)}>
                {t('accionDespachar')}
              </Button>
            )}
            {mode === 'cocina' && r.estado === 'despachada' && (
              <Button size="sm" onClick={() => handleConfirmar(r)}>
                {t('accionConfirmar')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
