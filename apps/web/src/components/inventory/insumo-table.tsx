'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Package,
  AlertTriangle,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Layers,
  TrendingDown,
  Trash2,
  Upload,
  Pencil,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getInsumos } from '@/modules/inventory/actions';
import { CreateInsumoDialog } from './create-insumo-dialog';
import { EditInsumoDialog } from './edit-insumo-dialog';
import { BulkImportDialog } from './bulk-import-dialog';
import { LotesSheet } from './lotes-sheet';
import { StockOutDialog } from './stock-out-dialog';
import { MermaDialog } from './merma-dialog';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { UserRole } from '@dorado/shared-types';

const WRITE_ROLES = new Set<UserRole | string>(['superuser', 'admin', 'sous_chef']);
const STOCK_OUT_ROLES = new Set<UserRole | string>([
  'superuser',
  'admin',
  'chef_cocina_fria',
  'chef_cocina_caliente',
  'sous_chef',
]);
const MERMA_ROLES = new Set<UserRole | string>([
  'superuser',
  'admin',
  'chef_cocina_fria',
  'chef_cocina_caliente',
  'sous_chef',
  'personal_almacen',
]);

interface InsumoTableProps {
  initialData: InsumoWithStock[];
  error?: string | undefined;
  userRole?: UserRole | undefined;
}

export function InsumoTable({ initialData, error: initialError, userRole }: InsumoTableProps) {
  const t = useTranslations('inventory');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initialError);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [lotesInsumo, setLotesInsumo] = useState<InsumoWithStock | null>(null);
  const [stockOutInsumo, setStockOutInsumo] = useState<InsumoWithStock | null>(null);
  const [mermaInsumo, setMermaInsumo] = useState<InsumoWithStock | null>(null);
  const [editInsumo, setEditInsumo] = useState<InsumoWithStock | null>(null);

  const canWrite = WRITE_ROLES.has(userRole ?? '');
  const canStockOut = STOCK_OUT_ROLES.has(userRole ?? '');
  const canMerma = MERMA_ROLES.has(userRole ?? '');

  const refresh = async () => {
    setLoading(true);
    setFetchError(undefined);
    const result = await getInsumos();
    if (result.ok) {
      setData(result.value);
    } else {
      setFetchError(result.error.message);
    }
    setLoading(false);
  };

  const handleCreated = () => {
    setDialogOpen(false);
    refresh();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4" />
          <span>{t('count', { n: data.length })}</span>
        </div>
        <div className="flex items-center gap-2">
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
          {canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkOpen(true)}
                title={t('bulkImportTooltip')}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {t('bulkImportButton')}
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t('newInsumo')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>{t('columns.nombre')}</TableHead>
              <TableHead>{t('columns.codigo')}</TableHead>
              <TableHead>{t('columns.capa')}</TableHead>
              <TableHead>{t('columns.unidad')}</TableHead>
              <TableHead className="text-right">{t('columns.stockActual')}</TableHead>
              <TableHead className="text-right">{t('columns.stockMinimo')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.map((insumo) => {
                const lowStock = insumo.stockActual <= insumo.stockMinimo;
                return (
                  <TableRow key={insumo.id} className="border-border">
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {insumo.nombre}
                        {lowStock && (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {insumo.codigo ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={insumo.capa === 'capa_1' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {t(`capa.${insumo.capa}` as 'capa.capa_1' | 'capa.capa_2')}
                      </Badge>
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
                        'text-right tabular-nums text-sm',
                        lowStock ? 'text-destructive font-semibold' : 'text-foreground',
                      )}
                    >
                      {insumo.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {insumo.stockMinimo.toLocaleString('es-CO', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLotesInsumo(insumo)}>
                            <Layers className="h-3.5 w-3.5 mr-2" />
                            {t('actions.lotes')}
                          </DropdownMenuItem>
                          {canWrite && (
                            <DropdownMenuItem onClick={() => setEditInsumo(insumo)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              {t('actions.edit')}
                            </DropdownMenuItem>
                          )}
                          {canStockOut && (
                            <DropdownMenuItem
                              onClick={() => setStockOutInsumo(insumo)}
                              className="text-destructive focus:text-destructive"
                            >
                              <TrendingDown className="h-3.5 w-3.5 mr-2" />
                              {t('actions.stockOut')}
                            </DropdownMenuItem>
                          )}
                          {canMerma && (
                            <DropdownMenuItem
                              onClick={() => setMermaInsumo(insumo)}
                              className="text-amber-500 focus:text-amber-500"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              {t('actions.merma')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {canWrite && (
        <CreateInsumoDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={handleCreated}
        />
      )}

      {canWrite && (
        <EditInsumoDialog
          insumo={editInsumo}
          onOpenChange={(open) => {
            if (!open) setEditInsumo(null);
          }}
          onSaved={refresh}
        />
      )}

      {canWrite && (
        <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} onImported={refresh} />
      )}

      <LotesSheet
        insumo={lotesInsumo}
        onOpenChange={(open) => {
          if (!open) setLotesInsumo(null);
        }}
        onLoteCreated={refresh}
      />

      {canStockOut && (
        <StockOutDialog
          insumo={stockOutInsumo}
          onOpenChange={(open) => {
            if (!open) setStockOutInsumo(null);
          }}
          onSuccess={refresh}
        />
      )}

      {canMerma && (
        <MermaDialog
          insumo={mermaInsumo}
          onOpenChange={(open) => {
            if (!open) setMermaInsumo(null);
          }}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
