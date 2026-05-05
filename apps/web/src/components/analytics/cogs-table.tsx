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

function formatCop(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFecha(date: Date): string {
  return new Date(date).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CogsTable({ data }: CogsTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg">
        Sin datos — refresca las vistas o selecciona otro período
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-xs font-medium text-muted-foreground">Turno</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Inicio</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              Pasajeros
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              COGS total
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground text-right">
              COGS / pasajero
            </TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
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
                {row.totalPasajeros.toLocaleString('es-CO')}
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
                    Cerrado
                  </Badge>
                ) : (
                  <Badge className="text-xs">Activo</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
