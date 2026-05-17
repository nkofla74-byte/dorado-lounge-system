'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CogsPerPassenger } from '@/modules/analytics/domain/kpi';

interface CogsTableProps {
  data: CogsPerPassenger[];
}

export function CogsTable({ data }: CogsTableProps) {
  const t = useTranslations('analytics');
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CO';

  const formatCop = (value: number): string =>
    new Intl.NumberFormat(dateLocale, {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatFecha = (date: Date): string =>
    new Date(date).toLocaleString(dateLocale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
        {t('cogsEmpty')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-medium text-muted-foreground">
              {t('colTurno')}
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">
              {t('colInicio')}
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              {t('colPasajeros')}
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              {t('colCogsTotal')}
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              {t('colCogsPorPasajero')}
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">
              {t('colEstado')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.turnoId} className="hover:bg-muted/30">
              <TableCell className="font-medium text-sm">{row.turnoNombre}</TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatFecha(row.iniciadoAt)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {row.totalPasajeros.toLocaleString(dateLocale)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatCop(row.cogsTotalCop)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-medium">
                {row.cogsPerPassenger !== null ? formatCop(row.cogsPerPassenger) : '—'}
              </TableCell>
              <TableCell>
                {row.cerradoAt ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {t('estadoCerrado')}
                  </Badge>
                ) : (
                  <Badge className="text-xs">{t('estadoActivo')}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
