'use client';

import { useState, useEffect } from 'react';
import { Package, TrendingDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getHistorialCompras } from '@/modules/proveedores/actions';
import type { LoteConInsumo } from '@/modules/proveedores/application/ports/proveedor-repository.port';

function formatCOP(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

interface HistorialComprasProps {
  proveedorId: string;
}

export function HistorialCompras({ proveedorId }: HistorialComprasProps) {
  const [lotes, setLotes] = useState<LoteConInsumo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getHistorialCompras(proveedorId).then((r) => {
      if (r.ok) setLotes(r.value);
      setLoading(false);
    });
  }, [proveedorId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">Cargando historial…</div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <Package className="h-8 w-8 opacity-30" />
        Sin lotes registrados para este proveedor.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead>Insumo</TableHead>
            <TableHead>Fecha recibido</TableHead>
            <TableHead className="text-right">Cantidad inicial</TableHead>
            <TableHead className="text-right">Stock actual</TableHead>
            <TableHead className="text-right">Costo unit.</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotes.map((lote) => {
            const pct =
              lote.cantidadInicial > 0 ? (lote.cantidadActual / lote.cantidadInicial) * 100 : 0;
            const isLow = pct < 20;
            return (
              <TableRow key={lote.id} className="border-border">
                <TableCell className="font-medium text-sm">{lote.insumoNombre}</TableCell>
                <TableCell className="text-sm tabular-nums">{lote.fechaRecibido}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {lote.cantidadInicial.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`text-sm tabular-nums ${isLow ? 'text-amber-500 font-medium' : ''}`}
                  >
                    {isLow && <TrendingDown className="inline h-3.5 w-3.5 mr-0.5" />}
                    {lote.cantidadActual.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatCOP(lote.costoUnitario)}
                </TableCell>
                <TableCell>
                  {lote.activo ? (
                    <Badge
                      variant="outline"
                      className="text-xs text-emerald-500 border-emerald-500/30"
                    >
                      Activo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Agotado
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
