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
import type { ConsumoInsumo } from '@/modules/analytics/domain/kpi';

interface ConsumoTableProps {
  data: ConsumoInsumo[];
  showTenant?: boolean;
}

export function ConsumoTable({ data, showTenant = false }: ConsumoTableProps) {
  const t = useTranslations('analytics');
  const locale = useLocale();
  const numLocale = locale === 'en' ? 'en-US' : 'es-CO';

  const fmt = (n: number, decimals = 4): string =>
    n.toLocaleString(numLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
        {t('consumoEmpty')}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {showTenant && (
              <TableHead className="text-caption font-medium text-muted-foreground">
                {t('colTenant')}
              </TableHead>
            )}
            <TableHead className="text-caption font-medium text-muted-foreground">
              {t('colInsumo')}
            </TableHead>
            <TableHead className="text-caption font-medium text-muted-foreground">
              {t('colCapa')}
            </TableHead>
            <TableHead className="text-caption font-medium text-muted-foreground text-right">
              {t('colEntradas')}
            </TableHead>
            <TableHead className="text-caption font-medium text-muted-foreground text-right">
              {t('colConsumo')}
            </TableHead>
            <TableHead className="text-caption font-medium text-muted-foreground text-right">
              {t('colMerma')}
            </TableHead>
            <TableHead className="text-caption font-medium text-muted-foreground text-right">
              {t('colAjustes')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={`${row.tenantId}-${row.turnoId}-${row.insumoId}`}
              className="hover:bg-muted/30"
            >
              {showTenant && (
                <TableCell>
                  {row.tenantNombre ? (
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                      {row.tenantNombre}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground/40 text-caption">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="font-medium text-sm">{row.insumoNombre}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-caption">
                  {row.capa === 'capa_1' ? t('capa1') : t('capa2')}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {fmt(row.totalEntradas)} {row.unidadMedida}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums font-medium">
                {fmt(row.totalConsumo)} {row.unidadMedida}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-destructive/80">
                {fmt(row.totalMerma)} {row.unidadMedida}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                {fmt(row.totalAjustes)} {row.unidadMedida}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
