'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PackagePlus, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { getInsumos } from '@/modules/inventory/actions';
import { LotesSheet } from './lotes-sheet';
import { MermaDialog } from './merma-dialog';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { UserRole } from '@dorado/shared-types';

interface AlmacenPanelProps {
  initialData: InsumoWithStock[];
  userRole?: UserRole | undefined;
}

export function AlmacenPanel({ initialData, userRole: _userRole }: AlmacenPanelProps) {
  const t = useTranslations('inventory');
  const tA = useTranslations('inventory.almacen');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [lotesInsumo, setLotesInsumo] = useState<InsumoWithStock | null>(null);
  const [mermaInsumo, setMermaInsumo] = useState<InsumoWithStock | null>(null);

  const refresh = async () => {
    setLoading(true);
    const result = await getInsumos();
    if (result.ok) setData(result.value.filter((i) => i.capa === 'capa_1'));
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tA('subtitle')}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={refresh}
          disabled={loading}
          title={t('refresh')}
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>{tA('insumo')}</TableHead>
              <TableHead>{t('columns.codigo')}</TableHead>
              <TableHead>{t('columns.unidad')}</TableHead>
              <TableHead className="text-right">{t('columns.stockActual')}</TableHead>
              <TableHead className="text-right">{t('columns.stockMinimo')}</TableHead>
              <TableHead className="text-right">{tA('acciones')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  {tA('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data
                .sort((a, b) => {
                  const aLow = a.stockActual <= a.stockMinimo ? 0 : 1;
                  const bLow = b.stockActual <= b.stockMinimo ? 0 : 1;
                  return aLow - bLow;
                })
                .map((insumo) => {
                  const lowStock = insumo.stockActual <= insumo.stockMinimo;
                  return (
                    <TableRow key={insumo.id} className="border-border">
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {insumo.nombre}
                          {lowStock && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5 py-0 h-4 font-normal"
                            >
                              {tA('bajoMinimo')}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm font-mono">
                        {insumo.codigo ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.has(`unidad.${insumo.unidadMedida}`)
                          ? t(
                              `unidad.${insumo.unidadMedida}` as
                                | 'unidad.kg'
                                | 'unidad.g'
                                | 'unidad.l'
                                | 'unidad.ml'
                                | 'unidad.unidad'
                                | 'unidad.porcion',
                            )
                          : insumo.unidadMedida}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums text-sm font-medium',
                          lowStock ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {insumo.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {insumo.stockMinimo.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => setLotesInsumo(insumo)}
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                            {tA('ingresarLote')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700"
                            onClick={() => setMermaInsumo(insumo)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t('actions.merma')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1.5 text-muted-foreground"
                            onClick={() => setLotesInsumo(insumo)}
                          >
                            <Layers className="h-3.5 w-3.5" />
                            {tA('verLotes')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
      </div>

      <LotesSheet
        insumo={lotesInsumo}
        onOpenChange={(open) => {
          if (!open) setLotesInsumo(null);
        }}
        onLoteCreated={refresh}
      />

      <MermaDialog
        insumo={mermaInsumo}
        onOpenChange={(open) => {
          if (!open) setMermaInsumo(null);
        }}
        onSuccess={refresh}
      />
    </div>
  );
}
