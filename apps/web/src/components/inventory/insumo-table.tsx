'use client';

import { useState } from 'react';
import { Package, AlertTriangle, Plus, RefreshCw } from 'lucide-react';
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
import { CreateInsumoDialog } from './create-insumo-dialog';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';

const CAPA_LABEL: Record<string, string> = {
  capa_1: 'Bodega',
  capa_2: 'Producción',
};

const UNIDAD_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  unidad: 'und',
  porcion: 'porc',
};

interface InsumoTableProps {
  initialData: InsumoWithStock[];
  error?: string | undefined;
}

export function InsumoTable({ initialData, error: initialError }: InsumoTableProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initialError);
  const [dialogOpen, setDialogOpen] = useState(false);

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
          <span>{data.length} insumos</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={loading}
            title="Actualizar"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo insumo
          </Button>
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
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Capa</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Stock actual</TableHead>
              <TableHead className="text-right">Stock mínimo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  No hay insumos registrados. Crea el primero con el botón de arriba.
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
                        {CAPA_LABEL[insumo.capa] ?? insumo.capa}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {UNIDAD_LABEL[insumo.unidadMedida] ?? insumo.unidadMedida}
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreateInsumoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
