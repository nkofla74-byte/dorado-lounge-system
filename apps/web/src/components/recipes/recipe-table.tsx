'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BookOpen,
  AlertTriangle,
  Plus,
  RefreshCw,
  ChevronRight,
  QrCode,
  TrendingUp,
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
import { cn } from '@/lib/utils';
import { getRecetas } from '@/modules/recipes/actions';
import { getCostosRecetas } from '@/modules/costos/actions';
import { CreateRecipeDialog } from './create-recipe-dialog';
import { IngredientsSheet } from './ingredients-sheet';
import type { RecetaWithIngredientes, RecetaIngrediente } from '@/modules/recipes/domain/recipe';
import type { CategoriaMenu } from '@dorado/shared-types';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { CostoReceta } from '@/modules/costos/domain/costo';

type ZonaKey = 'amex' | 'snack' | 'buffet';

const formatCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

interface RecipeTableProps {
  initialData: RecetaWithIngredientes[];
  insumos: InsumoWithStock[];
  initialCostos?: Record<string, CostoReceta> | undefined;
  error?: string | undefined;
}

export function RecipeTable({
  initialData,
  insumos,
  initialCostos = {},
  error: initialError,
}: RecipeTableProps) {
  const t = useTranslations('recipes');
  const tZ = useTranslations('zonas');
  const tCat = useTranslations('categoriasMenu');
  const [data, setData] = useState(initialData);
  const [costos, setCostos] = useState<Record<string, CostoReceta>>(initialCostos);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(initialError);
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetReceta, setSheetReceta] = useState<RecetaWithIngredientes | null>(null);

  const insumosCapa2 = insumos.filter((i) => i.capa === 'capa_2');

  const refresh = async () => {
    setLoading(true);
    setFetchError(undefined);
    const result = await getRecetas();
    if (result.ok) {
      setData(result.value);
      const ids = result.value.map((r) => r.id);
      if (ids.length > 0) {
        const cr = await getCostosRecetas(ids);
        if (cr.ok) setCostos(cr.value);
      }
    } else {
      setFetchError(result.error.message);
    }
    setLoading(false);
  };

  const handleCreated = () => {
    setCreateOpen(false);
    refresh();
  };

  const handleIngredienteAdded = (recetaId: string, ingrediente: RecetaIngrediente) => {
    setData((prev) =>
      prev.map((r) =>
        r.id === recetaId ? { ...r, ingredientes: [...r.ingredientes, ingrediente] } : r,
      ),
    );
    setSheetReceta((prev) =>
      prev?.id === recetaId ? { ...prev, ingredientes: [...prev.ingredientes, ingrediente] } : prev,
    );
  };

  const handleMenuMetaUpdated = (
    recetaId: string,
    categoriaMenu: CategoriaMenu | null,
    descripcion: string | null,
    imagenUrl: string | null,
  ) => {
    setData((prev) =>
      prev.map((r) => (r.id === recetaId ? { ...r, categoriaMenu, descripcion, imagenUrl } : r)),
    );
    setSheetReceta((prev) =>
      prev?.id === recetaId ? { ...prev, categoriaMenu, descripcion, imagenUrl } : prev,
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>{t('count', { n: data.length })}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={refresh}
            disabled={loading}
            aria-label={t('refreshAria')}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('newRecipe')}
          </Button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fetchError}
        </div>
      )}

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead>{t('colNombre')}</TableHead>
              <TableHead>{t('colTipo')}</TableHead>
              <TableHead>{t('colDestino')}</TableHead>
              <TableHead className="text-center">{t('colPorciones')}</TableHead>
              <TableHead className="text-center">{t('colIngredientes')}</TableHead>
              <TableHead>
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {t('colCostoPorcion')}
                </span>
              </TableHead>
              <TableHead>
                <span className="flex items-center gap-1">
                  <QrCode className="h-3.5 w-3.5" />
                  {t('colMenuQR')}
                </span>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.map((receta) => {
                const costo = costos[receta.id];
                return (
                  <TableRow key={receta.id} className="border-border">
                    <TableCell className="font-medium">{receta.nombre}</TableCell>
                    <TableCell>
                      <Badge
                        variant={receta.tipoReceta === 'produccion' ? 'secondary' : 'outline'}
                        className="text-caption"
                      >
                        {receta.tipoReceta === 'produccion'
                          ? t('tipoProduccion')
                          : t('tipoServicio')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {receta.tipoReceta === 'produccion'
                        ? (receta.insumoDestinoNombre ?? '—')
                        : receta.zona && tZ.has(receta.zona)
                          ? tZ(receta.zona as ZonaKey)
                          : (receta.zona ?? '—')}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-sm">
                      {receta.porciones}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'text-sm tabular-nums',
                          receta.ingredientes.length === 0
                            ? 'text-senal-aviso/80'
                            : 'text-foreground',
                        )}
                      >
                        {receta.ingredientes.length}
                      </span>
                    </TableCell>
                    <TableCell>
                      {costo ? (
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            !costo.tieneCostoCompleto && 'text-senal-aviso/80',
                          )}
                          title={!costo.tieneCostoCompleto ? t('faltanPrecios') : undefined}
                        >
                          {costo.costoPorPorcion != null ? formatCOP(costo.costoPorPorcion) : '—'}
                          {!costo.tieneCostoCompleto && (
                            <AlertTriangle className="inline h-3 w-3 ml-1 text-senal-aviso/80" />
                          )}
                        </span>
                      ) : receta.ingredientes.length === 0 ? (
                        <span className="text-caption text-muted-foreground/40">
                          {t('sinIngredientes')}
                        </span>
                      ) : (
                        <span className="text-caption text-muted-foreground/40">
                          {t('sinPrecios')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {receta.tipoReceta === 'servicio' ? (
                        receta.categoriaMenu ? (
                          <Badge variant="secondary" className="text-caption">
                            {tCat(receta.categoriaMenu)}
                          </Badge>
                        ) : (
                          <span className="text-caption text-muted-foreground/60">
                            {t('sinCategoria')}
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setSheetReceta(receta)}
                        aria-label={t('verIngredientes')}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreateRecipeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        insumos={insumos}
        insumosCapa2={insumosCapa2}
      />

      <IngredientsSheet
        receta={sheetReceta}
        open={sheetReceta !== null}
        costo={sheetReceta ? costos[sheetReceta.id] : undefined}
        onOpenChange={(open) => {
          if (!open) setSheetReceta(null);
        }}
        insumos={insumos}
        onIngredienteAdded={(recetaId, ingrediente) => {
          handleIngredienteAdded(recetaId, ingrediente);
          void getCostosRecetas([recetaId]).then((r) => {
            if (r.ok) setCostos((prev) => ({ ...prev, ...r.value }));
          });
        }}
        onMenuMetaUpdated={handleMenuMetaUpdated}
      />
    </div>
  );
}
