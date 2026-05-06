'use client';

import { useState } from 'react';
import { BookOpen, AlertTriangle, Plus, RefreshCw, ChevronRight, QrCode } from 'lucide-react';
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
import { CreateRecipeDialog } from './create-recipe-dialog';
import { IngredientsSheet } from './ingredients-sheet';
import type { RecetaWithIngredientes, RecetaIngrediente } from '@/modules/recipes/domain/recipe';
import type { CategoriaMenu } from '@dorado/shared-types';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';

const ZONA_LABEL: Record<string, string> = {
  amex: 'Amex',
  snack: 'Snack',
  buffet: 'Buffet',
};

const CATEGORIA_LABEL: Record<CategoriaMenu, string> = {
  entrada: 'Entrada',
  plato_fuerte: 'Plato fuerte',
  acompanante: 'Acompañante',
};

interface RecipeTableProps {
  initialData: RecetaWithIngredientes[];
  insumos: InsumoWithStock[];
  error?: string | undefined;
}

export function RecipeTable({ initialData, insumos, error: initialError }: RecipeTableProps) {
  const [data, setData] = useState(initialData);
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
  ) => {
    setData((prev) =>
      prev.map((r) => (r.id === recetaId ? { ...r, categoriaMenu, descripcion } : r)),
    );
    setSheetReceta((prev) =>
      prev?.id === recetaId ? { ...prev, categoriaMenu, descripcion } : prev,
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>{data.length} recetas</span>
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
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva receta
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
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Destino / Zona</TableHead>
              <TableHead className="text-center">Porciones</TableHead>
              <TableHead className="text-center">Ingredientes</TableHead>
              <TableHead>
                <span className="flex items-center gap-1">
                  <QrCode className="h-3.5 w-3.5" />
                  Menú QR
                </span>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No hay recetas registradas. Crea la primera con el botón de arriba.
                </TableCell>
              </TableRow>
            ) : (
              data.map((receta) => (
                <TableRow key={receta.id} className="border-border">
                  <TableCell className="font-medium">{receta.nombre}</TableCell>
                  <TableCell>
                    <Badge
                      variant={receta.tipoReceta === 'produccion' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {receta.tipoReceta === 'produccion' ? 'Producción' : 'Servicio'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {receta.tipoReceta === 'produccion'
                      ? (receta.insumoDestinoNombre ?? '—')
                      : (ZONA_LABEL[receta.zona ?? ''] ?? receta.zona ?? '—')}
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">
                    {receta.porciones}
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        'text-sm tabular-nums',
                        receta.ingredientes.length === 0 ? 'text-amber-500/80' : 'text-foreground',
                      )}
                    >
                      {receta.ingredientes.length}
                    </span>
                  </TableCell>
                  <TableCell>
                    {receta.tipoReceta === 'servicio' ? (
                      receta.categoriaMenu ? (
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORIA_LABEL[receta.categoriaMenu]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">Sin categoría</span>
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
                      title="Ver ingredientes"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateRecipeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
        insumosCapa2={insumosCapa2}
      />

      <IngredientsSheet
        receta={sheetReceta}
        open={sheetReceta !== null}
        onOpenChange={(open) => {
          if (!open) setSheetReceta(null);
        }}
        insumos={insumos}
        onIngredienteAdded={handleIngredienteAdded}
        onMenuMetaUpdated={handleMenuMetaUpdated}
      />
    </div>
  );
}
