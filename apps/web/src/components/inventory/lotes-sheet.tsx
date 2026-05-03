'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, PackagePlus } from 'lucide-react';
import { createLoteSchema } from '@dorado/shared-validation';
import { getLotesByInsumo, createLote } from '@/modules/inventory/actions';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { InsumoWithStock, Lote } from '@/modules/inventory/domain/insumo';
import type { z } from 'zod';

type FormInput = z.input<typeof createLoteSchema>;
type FormOutput = z.output<typeof createLoteSchema>;

interface LotesSheetProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onLoteCreated?: () => void;
}

const UNIDAD_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  unidad: 'und',
  porcion: 'porc',
};

function expiryClass(fechaVencimiento: string | null): string {
  if (!fechaVencimiento) return 'text-muted-foreground';
  const diff = new Date(fechaVencimiento).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return 'text-destructive font-medium';
  if (days < 7) return 'text-amber-400 font-medium';
  return 'text-muted-foreground';
}

function expiryLabel(fechaVencimiento: string | null): string {
  if (!fechaVencimiento) return 'Sin vencimiento';
  const diff = new Date(fechaVencimiento).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `Vencido hace ${Math.abs(days)}d`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return fechaVencimiento;
}

export function LotesSheet({ insumo, onOpenChange, onLoteCreated }: LotesSheetProps) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createLoteSchema),
    defaultValues: { insumoId: insumo?.id ?? '' },
  });

  useEffect(() => {
    if (!insumo) return;
    setLoadingLotes(true);
    setLotes([]);
    getLotesByInsumo(insumo.id).then((result) => {
      if (result.ok) setLotes(result.value);
      setLoadingLotes(false);
    });
    // Reset form for new insumo
    reset({ insumoId: insumo.id });
    setShowForm(false);
    setServerError('');
  }, [insumo, reset]);

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createLote(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    setLotes((prev) => [...prev, result.value]);
    reset({ insumoId: insumo?.id ?? '' });
    setShowForm(false);
    onLoteCreated?.();
  };

  const unidad = insumo ? (UNIDAD_LABEL[insumo.unidadMedida] ?? insumo.unidadMedida) : '';

  return (
    <Sheet open={!!insumo} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            Lotes — {insumo?.nombre}
          </SheetTitle>
          <SheetDescription>
            Stock actual:{' '}
            <span className="font-semibold text-foreground">
              {insumo?.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 })} {unidad}
            </span>
          </SheetDescription>
        </SheetHeader>

        {/* Lista de lotes */}
        <div className="space-y-2 mb-6">
          {loadingLotes ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando lotes…
            </div>
          ) : lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay lotes activos. Agrega el primero.
            </p>
          ) : (
            lotes.map((lote) => (
              <div
                key={lote.id}
                className="rounded-md border border-border bg-card px-4 py-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium tabular-nums">
                    {lote.cantidadActual.toLocaleString('es-CO', { maximumFractionDigits: 4 })}{' '}
                    <span className="text-muted-foreground font-normal">
                      / {lote.cantidadInicial.toLocaleString('es-CO', { maximumFractionDigits: 4 })}{' '}
                      {unidad}
                    </span>
                  </span>
                  <span className={cn('text-xs', expiryClass(lote.fechaVencimiento))}>
                    {expiryLabel(lote.fechaVencimiento)}
                  </span>
                </div>
                {lote.proveedor && (
                  <p className="text-xs text-muted-foreground">{lote.proveedor}</p>
                )}
                {lote.costoUnitario !== null && (
                  <p className="text-xs text-muted-foreground">
                    ${lote.costoUnitario.toLocaleString('es-CO')} / {unidad}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Botón agregar / formulario */}
        {!showForm ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Agregar lote
          </Button>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-3 border border-border rounded-md p-4"
          >
            <p className="text-sm font-medium">Nuevo lote</p>

            <input type="hidden" {...register('insumoId')} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cantidadInicial">
                  Cantidad inicial *{' '}
                  <span className="text-muted-foreground font-normal">({unidad})</span>
                </Label>
                <Input
                  id="cantidadInicial"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="0.00"
                  {...register('cantidadInicial', { valueAsNumber: true })}
                />
                {errors.cantidadInicial && (
                  <p className="text-xs text-destructive">{errors.cantidadInicial.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fechaVencimiento">
                  Vencimiento <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input id="fechaVencimiento" type="date" {...register('fechaVencimiento')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proveedor">
                  Proveedor <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Input
                  id="proveedor"
                  placeholder="Nombre del proveedor"
                  {...register('proveedor')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="costoUnitario">
                  Costo / {unidad} <span className="text-muted-foreground font-normal">(COP)</span>
                </Label>
                <Input
                  id="costoUnitario"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  {...register('costoUnitario', { valueAsNumber: true })}
                />
              </div>
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Guardar lote'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  setShowForm(false);
                  setServerError('');
                  reset({ insumoId: insumo?.id ?? '' });
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
