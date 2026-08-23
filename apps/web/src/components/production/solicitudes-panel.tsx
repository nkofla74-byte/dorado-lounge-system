'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChefHat, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSocket } from '@/lib/socket/use-socket';
import { CHANNELS } from '@dorado/shared-types';
import type { SocketEvent } from '@dorado/shared-types';

interface Solicitud {
  id: string;
  descripcion: string;
  zona: string;
  createdAt: string;
}

interface Props {
  initialSolicitudes: Solicitud[];
  fetchSolicitudes: () => Promise<Solicitud[]>;
}

export function SolicitudesPanel({ initialSolicitudes, fetchSolicitudes }: Props) {
  const t = useTranslations('pasteleria');
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(initialSolicitudes);
  const [refreshing, setRefreshing] = useState(false);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const data = await fetchSolicitudes();
    setSolicitudes(data);
    setRefreshing(false);
  }, [fetchSolicitudes]);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.BROADCAST_COCINA);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'SOLICITUD_PREPARACION') {
        refresh();
        toast.info(
          t('nuevaSolicitudToast', {
            zona: event.payload.zona,
            descripcion: event.payload.descripcion,
          }),
        );
      }
    };

    socket.on('event', handleEvent);
    socket.on('connect', refresh);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', CHANNELS.BROADCAST_COCINA);
    };
  }, [socket, refresh, t]);

  const formatFecha = (iso: string): string =>
    new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (solicitudes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ChefHat className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{t('solicitudesTitle')}</h2>
        <Badge variant="outline" className="text-caption">
          {solicitudes.length}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-auto"
          onClick={refresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-caption font-medium text-muted-foreground">
                {t('colZona')}
              </TableHead>
              <TableHead className="text-caption font-medium text-muted-foreground">
                {t('colDescripcion')}
              </TableHead>
              <TableHead className="text-caption font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t('colEnviado')}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {solicitudes.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/30">
                <TableCell>
                  <Badge variant="secondary" className="text-caption uppercase">
                    {s.zona}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{s.descripcion}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatFecha(s.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
