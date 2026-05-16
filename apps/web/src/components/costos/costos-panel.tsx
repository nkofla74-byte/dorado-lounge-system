'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, TrendingUp, CheckCircle2, ArrowUpDown } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { RecetaWithIngredientes } from '@/modules/recipes/domain/recipe';
import type { CostoReceta } from '@/modules/costos/domain/costo';

interface CostosPanelProps {
  recetas: RecetaWithIngredientes[];
  costos: Record<string, CostoReceta>;
}

type SortKey = 'nombre' | 'costo' | 'tipo' | 'porciones';

function formatCOP(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function CostosPanel({ recetas, costos }: CostosPanelProps) {
  const t = useTranslations('costos');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nombre');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterIncompleto, setFilterIncompleto] = useState(false);

  const stats = useMemo(() => {
    const conCosto = recetas.filter((r) => costos[r.id]);
    const completos = conCosto.filter((r) => costos[r.id]?.tieneCostoCompleto);
    const incompletos = conCosto.filter((r) => !costos[r.id]?.tieneCostoCompleto);
    const porPorcion = conCosto.map((r) => costos[r.id]?.costoPorPorcion ?? 0).filter((v) => v > 0);
    const promedio =
      porPorcion.length > 0 ? porPorcion.reduce((a, b) => a + b, 0) / porPorcion.length : null;
    return {
      total: recetas.length,
      conCosto: conCosto.length,
      completos: completos.length,
      incompletos: incompletos.length,
      promedio,
    };
  }, [recetas, costos]);

  const rows = useMemo(() => {
    let list = recetas.filter((r) => r.nombre.toLowerCase().includes(search.toLowerCase()));
    if (filterIncompleto) {
      list = list.filter((r) => costos[r.id] && !costos[r.id]!.tieneCostoCompleto);
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'nombre') cmp = a.nombre.localeCompare(b.nombre, 'es');
      else if (sortKey === 'tipo') cmp = a.tipoReceta.localeCompare(b.tipoReceta);
      else if (sortKey === 'porciones') cmp = (a.porciones ?? 0) - (b.porciones ?? 0);
      else if (sortKey === 'costo') {
        const ca = costos[a.id]?.costoPorPorcion ?? -1;
        const cb = costos[b.id]?.costoPorPorcion ?? -1;
        cmp = ca - cb;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [recetas, costos, search, sortKey, sortAsc, filterIncompleto]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => toggleSort(k)}
    >
      {label}
      <ArrowUpDown
        className={cn('h-3 w-3', sortKey === k ? 'text-primary' : 'text-muted-foreground/50')}
      />
    </button>
  );

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t('totalRecetas')}</p>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t('conCostoCompleto')}</p>
          <p className="text-2xl font-bold mt-1 text-green-500">{stats.completos}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t('costoIncompleto')}</p>
          <p className="text-2xl font-bold mt-1 text-amber-500">{stats.incompletos}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t('promedioPorcion')}</p>
          <p className="text-2xl font-bold mt-1">{formatCOP(stats.promedio)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder={t('buscarReceta')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Button
          variant={filterIncompleto ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setFilterIncompleto((v) => !v)}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('soloIncompletos')}
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">
                <SortBtn k="nombre" label={t('colReceta')} />
              </TableHead>
              <TableHead>
                <SortBtn k="tipo" label={t('colTipo')} />
              </TableHead>
              <TableHead className="text-right">
                <SortBtn k="porciones" label={t('colPorciones')} />
              </TableHead>
              <TableHead className="text-right">
                <SortBtn k="costo" label={t('colCostoTotal')} />
              </TableHead>
              <TableHead className="text-right">
                <SortBtn k="costo" label={t('colCostoPorcion')} />
              </TableHead>
              <TableHead className="text-center">{t('colEstado')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">
                  {t('sinResultados')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((receta) => {
                const costo = costos[receta.id];
                return (
                  <TableRow key={receta.id}>
                    <TableCell className="font-medium">{receta.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {receta.tipoReceta === 'produccion'
                          ? t('tipoProduccion')
                          : t('tipoServicio')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {receta.porciones ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-sm">
                      {formatCOP(costo?.costoTotal ?? null)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-mono text-sm font-medium',
                        costo && !costo.tieneCostoCompleto && 'text-amber-500',
                      )}
                    >
                      {formatCOP(costo?.costoPorPorcion ?? null)}
                    </TableCell>
                    <TableCell className="text-center">
                      {!costo ? (
                        <Badge variant="secondary" className="text-xs">
                          {t('sinLotes')}
                        </Badge>
                      ) : costo.tieneCostoCompleto ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span className="text-xs">{t('parcial')}</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {stats.incompletos > 0 && (
        <p className="text-xs text-amber-500 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t('advertenciaIncompletos', {
            count: stats.incompletos,
            suffix: stats.incompletos !== 1 ? 's' : '',
          })}
        </p>
      )}
    </div>
  );
}
