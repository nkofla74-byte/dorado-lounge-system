'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  UtensilsCrossed,
  Bell,
  ArrowDownToLine,
  RefreshCw,
  AlertTriangle,
  Clock,
  BarChart2,
  ChefHat,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  getDespachos,
  getStuartRequests,
  getSolicitudesPreparacion,
} from '@/modules/snack/actions';
import { EnviarStuartDialog } from './enviar-stuart-dialog';
import { StockOutSnackDialog } from './stock-out-snack-dialog';
import { SolicitarPreparacionDialog } from './solicitar-preparacion-dialog';
import type { DespachoSnack } from '@/modules/snack/domain/despacho-snack';
import type { StuartRequest } from '@/modules/snack/domain/stuart-request';
import type { SolicitudPreparacion } from '@/modules/snack/domain/solicitud-preparacion';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { UserRole } from '@dorado/shared-types';
import type { SocketEvent } from '@dorado/shared-types';

interface SnackPanelProps {
  initialDespachos: DespachoSnack[];
  initialStuart: StuartRequest[];
  initialSolicitudes: SolicitudPreparacion[];
  insumos: InsumoWithStock[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

const WRITE_ROLES = new Set<UserRole>(['superuser', 'admin', 'personal_snack']);

export function SnackPanel({
  initialDespachos,
  initialStuart,
  initialSolicitudes,
  insumos,
  userRole,
  error,
}: SnackPanelProps) {
  const t = useTranslations('snack');
  const locale = useLocale();
  const [despachos, setDespachos] = useState<DespachoSnack[]>(initialDespachos);
  const [stuartRequests, setStuartRequests] = useState<StuartRequest[]>(initialStuart);
  const [solicitudes, setSolicitudes] = useState<SolicitudPreparacion[]>(initialSolicitudes);
  const [stuartOpen, setStuartOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [preparacionOpen, setPreparacionOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(error);
  const [isPending, startTransition] = useTransition();
  const socket = useSocket();

  const canWrite = userRole ? WRITE_ROLES.has(userRole) : false;

  const formatFecha = (date: Date): string =>
    new Date(date).toLocaleString(locale === 'en' ? 'en-US' : 'es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const refreshDespachos = useCallback(() => {
    startTransition(async () => {
      const result = await getDespachos();
      if (result.ok) {
        setDespachos(result.value);
        setLoadError(undefined);
      } else {
        setLoadError(result.error.message);
      }
    });
  }, []);

  const refreshStuart = useCallback(() => {
    startTransition(async () => {
      const result = await getStuartRequests();
      if (result.ok) setStuartRequests(result.value);
    });
  }, []);

  const refreshSolicitudes = useCallback(() => {
    startTransition(async () => {
      const result = await getSolicitudesPreparacion();
      if (result.ok) setSolicitudes(result.value);
    });
  }, []);

  const refreshAll = useCallback(() => {
    refreshDespachos();
    refreshStuart();
    refreshSolicitudes();
  }, [refreshDespachos, refreshStuart, refreshSolicitudes]);

  // ── Real-time via Socket.io ──
  useEffect(() => {
    if (!socket) return;

    socket.emit('join', CHANNELS.SNACK);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'DESPACHO' && event.payload.zona === 'snack') {
        refreshDespachos();
        toast.info(t('nuevoDespachoToast'));
      }
      if (event.type === 'STUART_REQUEST' && event.payload.zona === 'snack') {
        refreshStuart();
      }
    };

    socket.on('event', handleEvent);
    socket.on('connect', refreshAll);

    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refreshAll);
      socket.emit('leave', CHANNELS.SNACK);
    };
  }, [socket, refreshDespachos, refreshStuart, refreshAll, t]);

  return (
    <div className="space-y-8">
      {/* Barra de acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={refreshAll}
          disabled={isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          {t('actualizar')}
        </Button>

        <div className="flex-1" />

        {canWrite && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreparacionOpen(true)}
              className="gap-2"
            >
              <ChefHat className="h-4 w-4" />
              {t('pedirPreparacion')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStuartOpen(true)}
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              {t('solicitarStuart')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setStockOutOpen(true)}
              className="gap-2"
            >
              <ArrowDownToLine className="h-4 w-4" />
              {t('stockOut')}
            </Button>
          </>
        )}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Stock local — preparaciones del turno/día agrupadas por receta */}
      {(() => {
        const stockMap = new Map<string, number>();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        for (const d of despachos) {
          if (new Date(d.despachadoAt) >= hoy) {
            stockMap.set(d.recetaNombre, (stockMap.get(d.recetaNombre) ?? 0) + d.cantidad);
          }
        }
        const stockHoy = Array.from(stockMap.entries()).sort((a, b) => b[1] - a[1]);
        const totalLotes = stockHoy.reduce((s, [, n]) => s + n, 0);
        return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t('stockLocalTitle')}</h2>
              <Badge variant="outline" className="text-xs">
                {t('lotesCount', { n: totalLotes })}
              </Badge>
            </div>
            {stockHoy.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
                {t('sinPreparaciones')}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {stockHoy.map(([nombre, cantidad]) => (
                  <div
                    key={nombre}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-0.5"
                  >
                    <p className="text-xs text-muted-foreground truncate">{nombre}</p>
                    <p className="text-xl font-bold tabular-nums">{cantidad}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* Despachos de cocina */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t('despachosTitle')}</h2>
          <Badge variant="outline" className="text-xs">
            {despachos.length}
          </Badge>
        </div>

        {despachos.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
            {t('sinDespachos')}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    {t('colReceta')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right">
                    {t('colBatches')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    {t('colDespachado')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {despachos.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{d.recetaNombre}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{d.cantidad}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFecha(d.despachadoAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Solicitudes de preparación a cocina */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t('preparacionTitle')}</h2>
          <Badge variant="outline" className="text-xs">
            {solicitudes.length}
          </Badge>
        </div>

        {solicitudes.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
            {t('sinSolicitudes')}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    {t('colDescripcion')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
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
                    <TableCell className="text-sm">{s.descripcion}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFecha(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Solicitudes Stuart recientes */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t('stuartTitle')}</h2>
          <Badge variant="outline" className="text-xs">
            {stuartRequests.length}
          </Badge>
        </div>

        {stuartRequests.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
            {t('sinStuart')}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    {t('colDescripcion')}
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t('colEnviado')}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stuartRequests.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">{s.descripcion}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatFecha(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Dialogs */}
      <SolicitarPreparacionDialog
        open={preparacionOpen}
        onOpenChange={setPreparacionOpen}
        onEnviado={refreshSolicitudes}
      />
      <EnviarStuartDialog
        open={stuartOpen}
        onOpenChange={setStuartOpen}
        onEnviado={refreshStuart}
      />
      <StockOutSnackDialog
        open={stockOutOpen}
        onOpenChange={setStockOutOpen}
        onRegistrado={() => {}}
        insumos={insumos}
      />
    </div>
  );
}
