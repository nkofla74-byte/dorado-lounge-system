'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTrazabilidadPedidos, getTrazaPedido } from '@/modules/orders/actions';
import type {
  TrazaFiltros,
  TrazaPedidoSummary,
  TrazaPedidoDetalle,
} from '@/modules/orders/actions';
import { cn } from '@/lib/utils';

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  creado: 'outline',
  recibido_cocina: 'secondary',
  en_preparacion: 'secondary',
  despachado: 'default',
  entregado: 'default',
  cancelado: 'destructive',
};

// Radix Select no admite value="" en SelectItem — sentinela para "sin filtro".
const ALL = '__all__';

const ZONAS = ['amex', 'snack', 'buffet'] as const;
const ESTADOS = [
  'creado',
  'recibido_cocina',
  'en_preparacion',
  'despachado',
  'entregado',
  'cancelado',
] as const;

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface TimelineRowProps {
  entry: TrazaPedidoDetalle['timeline'][number];
  t: ReturnType<typeof useTranslations<'trazabilidad'>>;
}

function TimelineRow({ entry, t }: TimelineRowProps) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 shrink-0 text-caption text-muted-foreground w-28">
        {formatDateTime(entry.at)}
      </span>
      <Badge
        variant={entry.tipo === 'item' ? 'outline' : 'secondary'}
        className="shrink-0 text-caption"
      >
        {t(`tipo.${entry.tipo}`)}
      </Badge>
      <span className="flex-1">
        {entry.itemNombre && <span className="font-medium">{entry.itemNombre} — </span>}
        <span>{t(`estadoLabel.${entry.estado}`)}</span>
      </span>
      {entry.actorNombre && (
        <span className="text-caption text-muted-foreground shrink-0">{entry.actorNombre}</span>
      )}
    </div>
  );
}

interface ExpandedRowProps {
  pedidoId: string;
}

function ExpandedRow({ pedidoId }: ExpandedRowProps) {
  const t = useTranslations('trazabilidad');
  const [detalle, setDetalle] = useState<TrazaPedidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await getTrazaPedido(pedidoId);
      if (res.ok) setDetalle(res.value);
      else setError(res.error.message);
    });
  }, [pedidoId, startTransition]);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('cargando')}
      </div>
    );
  }

  if (error) {
    return <p className="py-3 px-4 text-sm text-destructive">{error}</p>;
  }

  if (!detalle) return null;

  return (
    <div className="px-4 py-3 space-y-2 bg-muted/30 border-t">
      <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">
        {t('timeline')}
      </p>
      <div className="space-y-2">
        {detalle.timeline.map((entry, i) => (
          <TimelineRow key={i} entry={entry} t={t} />
        ))}
        {detalle.timeline.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('sinEventos')}</p>
        )}
      </div>
    </div>
  );
}

interface TrazabilidadPanelProps {
  initial: TrazaPedidoSummary[];
}

export function TrazabilidadPanel({ initial }: TrazabilidadPanelProps) {
  const t = useTranslations('trazabilidad');
  const [rows, setRows] = useState<TrazaPedidoSummary[]>(initial);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [zona, setZona] = useState('');
  const [estado, setEstado] = useState('');
  const [mesa, setMesa] = useState('');

  function buscar() {
    startTransition(async () => {
      const filtros: TrazaFiltros = { limit: 50 };
      if (desde) filtros.desde = desde;
      if (hasta) filtros.hasta = hasta;
      if (zona) filtros.zona = zona;
      if (estado) filtros.estado = estado;
      if (mesa) filtros.mesa = mesa;
      const res = await getTrazabilidadPedidos(filtros);
      if (res.ok) {
        setRows(res.value);
        setExpandedId(null);
      }
    });
  }

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">{t('filtros.desde')}</label>
          <Input
            type="datetime-local"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-8 text-sm w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">{t('filtros.hasta')}</label>
          <Input
            type="datetime-local"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-8 text-sm w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">{t('filtros.zona')}</label>
          <Select value={zona || ALL} onValueChange={(v) => setZona(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder={t('filtros.todas')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filtros.todas')}</SelectItem>
              {ZONAS.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">{t('filtros.estado')}</label>
          <Select value={estado || ALL} onValueChange={(v) => setEstado(v === ALL ? '' : v)}>
            <SelectTrigger className="h-8 text-sm w-44">
              <SelectValue placeholder={t('filtros.todos')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filtros.todos')}</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>
                  {t(`estadoLabel.${e}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-caption text-muted-foreground">{t('filtros.mesa')}</label>
          <Input
            value={mesa}
            onChange={(e) => setMesa(e.target.value)}
            placeholder={t('filtros.mesaPlaceholder')}
            className="h-8 text-sm w-24"
          />
        </div>
        <Button onClick={buscar} disabled={isPending} size="sm" className="self-end">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {t('filtros.buscar')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6" />
              <TableHead>{t('cols.fecha')}</TableHead>
              <TableHead>{t('cols.zona')}</TableHead>
              <TableHead>{t('cols.mesa')}</TableHead>
              <TableHead>{t('cols.estado')}</TableHead>
              <TableHead>{t('cols.responsable')}</TableHead>
              <TableHead className="text-right">{t('cols.items')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t('sinResultados')}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <Fragment key={row.pedidoId}>
                <TableRow
                  className={cn(
                    'cursor-pointer hover:bg-muted/50',
                    expandedId === row.pedidoId && 'bg-muted/30',
                  )}
                  onClick={() => toggleRow(row.pedidoId)}
                >
                  <TableCell className="pr-0 pl-3">
                    {expandedId === row.pedidoId ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell className="text-sm font-medium">{row.zona}</TableCell>
                  <TableCell className="text-sm">{row.numeroMesa ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_VARIANT[row.estado] ?? 'outline'}>
                      {t(`estadoLabel.${row.estado}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.responsableNombre ?? '—'}</TableCell>
                  <TableCell className="text-sm text-right">{row.cantidadItems}</TableCell>
                </TableRow>
                {expandedId === row.pedidoId && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="p-0">
                      <ExpandedRow pedidoId={row.pedidoId} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
