'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, QrCode, Check } from 'lucide-react';
import { addIngredienteSchema } from '@dorado/shared-validation';
import { addIngredienteAReceta, updateRecetaMenuMeta } from '@/modules/recipes/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { RecetaWithIngredientes, RecetaIngrediente } from '@/modules/recipes/domain/recipe';
import type { CategoriaMenu } from '@dorado/shared-types';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { CostoReceta } from '@/modules/costos/domain/costo';
import type { z } from 'zod';

type AddIngForm = z.input<typeof addIngredienteSchema>;
type AddIngOutput = z.output<typeof addIngredienteSchema>;

const UNIDAD_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  unidad: 'und',
  porcion: 'porc',
};

const CATEGORIA_LABELS: Record<CategoriaMenu, string> = {
  entrada: 'Entrada',
  plato_fuerte: 'Plato fuerte',
  acompanante: 'Acompañante',
};

const formatCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

interface IngredientsSheetProps {
  receta: RecetaWithIngredientes | null;
  open: boolean;
  costo?: CostoReceta | undefined;
  onOpenChange: (open: boolean) => void;
  insumos: InsumoWithStock[];
  onIngredienteAdded: (recetaId: string, ingrediente: RecetaIngrediente) => void;
  onMenuMetaUpdated?: (
    recetaId: string,
    categoriaMenu: CategoriaMenu | null,
    descripcion: string | null,
    imagenUrl: string | null,
  ) => void;
}

export function IngredientsSheet({
  receta,
  open,
  costo,
  onOpenChange,
  insumos,
  onIngredienteAdded,
  onMenuMetaUpdated,
}: IngredientsSheetProps) {
  const [serverError, setServerError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [menuCategoria, setMenuCategoria] = useState<CategoriaMenu | null>(null);
  const [menuDescripcion, setMenuDescripcion] = useState('');
  const [menuImagenUrl, setMenuImagenUrl] = useState('');
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuSaved, setMenuSaved] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddIngForm, unknown, AddIngOutput>({
    resolver: zodResolver(addIngredienteSchema),
    defaultValues: { mermaCoeficiente: 0 },
  });

  // Sync local menu state when the selected receta changes
  useEffect(() => {
    if (receta) {
      setMenuCategoria(receta.categoriaMenu);
      setMenuDescripcion(receta.descripcion ?? '');
      setMenuImagenUrl(receta.imagenUrl ?? '');
    }
  }, [receta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!receta) return null;

  const currentCategoria = menuCategoria;
  const currentDescripcion = menuDescripcion;

  const handleSaveMenuMeta = async () => {
    setMenuSaving(true);
    const result = await updateRecetaMenuMeta({
      recetaId: receta.id,
      categoriaMenu: currentCategoria,
      descripcion: currentDescripcion.trim() || null,
      imagenUrl: menuImagenUrl.trim() || null,
    });
    setMenuSaving(false);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    setMenuSaved(true);
    setTimeout(() => setMenuSaved(false), 2000);
    onMenuMetaUpdated?.(
      receta.id,
      currentCategoria,
      currentDescripcion.trim() || null,
      menuImagenUrl.trim() || null,
    );
  };

  const usedInsumoIds = new Set(receta.ingredientes.map((i) => i.insumoId));
  const availableInsumos = insumos.filter((i) => !usedInsumoIds.has(i.id));

  const onSubmit = async (values: AddIngOutput) => {
    setServerError('');
    const result = await addIngredienteAReceta({ ...values, recetaId: receta.id });
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    onIngredienteAdded(receta.id, result.value);
    reset();
    setShowForm(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
      setShowForm(false);
      setServerError('');
      setMenuCategoria(null);
      setMenuDescripcion('');
      setMenuSaved(false);
    }
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1 pb-4">
          <SheetTitle className="text-base">{receta.nombre}</SheetTitle>
          <SheetDescription className="text-xs">
            {receta.ingredientes.length} ingrediente{receta.ingredientes.length !== 1 ? 's' : ''}
            {' · '}
            {receta.porciones} porción{receta.porciones !== 1 ? 'es' : ''}
            {costo && (
              <>
                {' · '}
                <span
                  className={cn(
                    'font-medium',
                    costo.tieneCostoCompleto ? 'text-foreground' : 'text-amber-500',
                  )}
                >
                  {costo.costoPorPorcion != null ? formatCOP(costo.costoPorPorcion) : '—'} / porción
                </span>
                {!costo.tieneCostoCompleto && ' ⚠ costo parcial'}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <Separator className="mb-4" />

        {/* Lista de ingredientes */}
        <div className="space-y-2 mb-4">
          {receta.ingredientes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin ingredientes. Agrega el primero.
            </p>
          ) : (
            receta.ingredientes.map((ing) => {
              const costoIng = costo?.ingredientes.find((ci) => ci.insumoId === ing.insumoId);
              return (
                <div
                  key={ing.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md bg-muted/40 border border-border/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{ing.insumoNombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {ing.cantidad.toLocaleString('es-CO', { maximumFractionDigits: 4 })}{' '}
                      {UNIDAD_LABEL[ing.unidadMedida] ?? ing.unidadMedida}
                      {ing.mermaCoeficiente > 0 && (
                        <span className="ml-2 text-amber-500/80">
                          merma {(ing.mermaCoeficiente * 100).toFixed(1)}%
                        </span>
                      )}
                    </p>
                  </div>
                  {costoIng && (
                    <div className="text-right shrink-0 ml-3">
                      {costoIng.costoIngrediente != null ? (
                        <p className="text-xs font-medium tabular-nums">
                          {formatCOP(costoIng.costoIngrediente)}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-500/70">sin precio</p>
                      )}
                      {costoIng.precioUnitario != null && (
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatCOP(costoIng.precioUnitario)}/
                          {UNIDAD_LABEL[ing.unidadMedida] ?? ing.unidadMedida}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Resumen de costo total */}
        {costo && receta.ingredientes.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-sm">
            <span className="text-muted-foreground">Costo total receta</span>
            <span className="font-semibold tabular-nums">{formatCOP(costo.costoTotal)}</span>
          </div>
        )}

        {/* Formulario para agregar ingrediente */}
        {showForm ? (
          <div className="rounded-md border border-border/60 p-4 space-y-3 bg-muted/20">
            <p className="text-sm font-medium">Agregar ingrediente</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Insumo *</Label>
                <Select onValueChange={(v) => setValue('insumoId', v, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar insumo" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInsumos.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        Sin insumos disponibles
                      </SelectItem>
                    ) : (
                      availableInsumos.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.nombre}{' '}
                          <span className="text-muted-foreground">
                            ({UNIDAD_LABEL[i.unidadMedida] ?? i.unidadMedida})
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.insumoId && (
                  <p className="text-xs text-destructive">{errors.insumoId.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cantidad">Cantidad *</Label>
                  <Input
                    id="cantidad"
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="0.0000"
                    {...register('cantidad', { valueAsNumber: true })}
                  />
                  {errors.cantidad && (
                    <p className="text-xs text-destructive">{errors.cantidad.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mermaCoeficiente">Merma (0–0.9999)</Label>
                  <Input
                    id="mermaCoeficiente"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="0.9999"
                    placeholder="0"
                    {...register('mermaCoeficiente', { valueAsNumber: true })}
                  />
                  {errors.mermaCoeficiente && (
                    <p className="text-xs text-destructive">{errors.mermaCoeficiente.message}</p>
                  )}
                </div>
              </div>

              {serverError && (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    reset();
                    setShowForm(false);
                    setServerError('');
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agregar'}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={cn('w-full', availableInsumos.length === 0 && 'opacity-50')}
            onClick={() => setShowForm(true)}
            disabled={availableInsumos.length === 0}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar ingrediente
          </Button>
        )}

        {/* ── Sección Menú QR — solo para recetas de servicio ─────────────── */}
        {receta.tipoReceta === 'servicio' && (
          <>
            <Separator className="my-4" />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Menú QR</p>
                <span className="text-xs text-muted-foreground">(visible al pasajero)</span>
              </div>

              {/* Categoría */}
              <div className="space-y-1.5">
                <Label>Categoría en el menú</Label>
                <div className="flex gap-2">
                  {(['entrada', 'plato_fuerte', 'acompanante'] as CategoriaMenu[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMenuCategoria(cat === currentCategoria ? null : cat)}
                      className={cn(
                        'flex-1 py-1.5 text-xs rounded-lg border transition-colors',
                        currentCategoria === cat
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      {CATEGORIA_LABELS[cat]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sin categoría = no aparece en el menú QR
                </p>
              </div>

              {/* Descripción */}
              <div className="space-y-1.5">
                <Label htmlFor="descripcion-qr">Descripción corta</Label>
                <Textarea
                  id="descripcion-qr"
                  placeholder="Ej: Selección de quesos nacionales con mermelada de mora…"
                  rows={2}
                  maxLength={500}
                  value={menuDescripcion !== '' ? menuDescripcion : (receta.descripcion ?? '')}
                  onChange={(e) => setMenuDescripcion(e.target.value)}
                  className="resize-none text-sm"
                />
              </div>

              {/* URL de imagen */}
              <div className="space-y-1.5">
                <Label htmlFor="imagen-url">URL de foto del plato</Label>
                <Input
                  id="imagen-url"
                  type="url"
                  placeholder="https://…supabase.co/storage/v1/object/public/recetas/…"
                  value={menuImagenUrl}
                  onChange={(e) => setMenuImagenUrl(e.target.value)}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Sube la foto al bucket <code className="bg-muted px-1 rounded">recetas</code> en
                  Supabase Storage y pega la URL pública aquí.
                </p>
              </div>

              {serverError && (
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveMenuMeta}
                disabled={menuSaving}
              >
                {menuSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : menuSaved ? (
                  <Check className="h-4 w-4 mr-1.5" />
                ) : null}
                {menuSaved ? 'Guardado' : 'Guardar configuración QR'}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
