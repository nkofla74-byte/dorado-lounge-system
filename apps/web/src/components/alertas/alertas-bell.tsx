'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, BellRing, AlertTriangle, Info, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/lib/socket/use-socket';
import {
  getAlertas,
  getAlertasUnreadCount,
  marcarAlertaLeida,
  marcarTodasLeidas,
} from '@/modules/alertas/actions';
import { cn } from '@/lib/utils';
import type { Alerta } from '@/modules/alertas/domain/alerta';
import type { SocketEvent } from '@dorado/shared-types';

function SeveridadIcon({ severidad }: { severidad: Alerta['severidad'] }) {
  if (severidad === 'critical')
    return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />;
  if (severidad === 'warning')
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  return <Info className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />;
}

function useFormatRelativo() {
  const t = useTranslations('alertas.relative');
  return (d: Date): string => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return t('now');
    if (mins < 60) return t('minutes', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('hours', { n: hrs });
    return t('days', { n: Math.floor(hrs / 24) });
  };
}

export function AlertasBell() {
  const t = useTranslations('alertas');
  const formatRelativo = useFormatRelativo();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const socket = useSocket();

  const fetchCount = useCallback(async () => {
    const r = await getAlertasUnreadCount();
    if (r.ok) setUnread(r.value);
  }, []);

  const fetchAlertas = useCallback(async () => {
    const r = await getAlertas();
    if (r.ok) {
      setAlertas(r.value);
      setUnread(r.value.filter((a) => !a.leida).length);
    }
  }, []);

  useEffect(() => {
    void fetchCount();
  }, [fetchCount]);

  // Abrir popover → cargar lista completa
  useEffect(() => {
    if (open) void fetchAlertas();
  }, [open, fetchAlertas]);

  // Socket: recibir ALERTA en tiempo real
  useEffect(() => {
    if (!socket) return;
    const handle = (event: SocketEvent) => {
      if (event.type === 'ALERTA') {
        setUnread((n) => n + 1);
        // Si el panel está abierto, recargar lista
        setOpen((prev) => {
          if (prev) void fetchAlertas();
          return prev;
        });
      }
    };
    socket.on('event', handle);
    return () => {
      socket.off('event', handle);
    };
  }, [socket, fetchAlertas]);

  const handleMarcarLeida = async (id: string) => {
    await marcarAlertaLeida(id);
    setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, leida: true } : a)));
    setUnread((n) => Math.max(0, n - 1));
  };

  const handleMarcarTodas = async () => {
    await marcarTodasLeidas();
    setAlertas((prev) => prev.map((a) => ({ ...a, leida: true })));
    setUnread(0);
  };

  const hasCritical = alertas.some((a) => !a.leida && a.severidad === 'critical');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label={t('bellLabel')}
        >
          {hasCritical ? (
            <BellRing className="h-4 w-4 text-red-500 animate-bounce" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {unread > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full px-0.5 text-[10px] font-bold flex items-center justify-center text-white',
                hasCritical ? 'bg-red-500' : 'bg-amber-500',
              )}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-sm font-medium">{t('title')}</SheetTitle>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground gap-1 px-2"
              onClick={handleMarcarTodas}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t('markAll')}
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {alertas.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('empty')}</div>
          ) : (
            alertas.map((alerta) => (
              <button
                key={alerta.id}
                className={cn(
                  'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex gap-2',
                  !alerta.leida && 'bg-muted/20',
                )}
                onClick={() => !alerta.leida && handleMarcarLeida(alerta.id)}
              >
                <SeveridadIcon severidad={alerta.severidad} />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        'text-xs font-medium truncate',
                        !alerta.leida ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {alerta.titulo}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {formatRelativo(alerta.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 text-left">
                    {alerta.mensaje}
                  </p>
                  {!alerta.leida && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                      {t('new')}
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
