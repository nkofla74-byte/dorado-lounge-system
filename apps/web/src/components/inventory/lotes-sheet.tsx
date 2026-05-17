'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, PackagePlus } from 'lucide-react';
import { createLoteSchema } from '@dorado/shared-validation';
import { getLotesByInsumo, createLote } from '@/modules/inventory/actions';
import { getProveedores } from '@/modules/proveedores/actions';
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
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { z } from 'zod';

type FormInput = z.input<typeof createLoteSchema>;
type FormOutput = z.output<typeof createLoteSchema>;

interface LotesSheetProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onLoteCreated?: () => void;
}

type UnidadKey = 'kg' | 'g' | 'l' | 'ml' | 'unidad' | 'porcion';

function expiryClass(fechaVencimiento: string | null): string {
  if (!fechaVencimiento) return 'text-muted-foreground';
  const diff = new Date(fechaVencimiento).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return 'text-destructive font-medium';
  if (days < 7) return 'text-amber-400 font-medium';
  return 'text-muted-foreground';
}

export function LotesSheet({ insumo, onOpenChange, onLoteCreated }: LotesSheetProps) {
  const tInv = useTranslations('inventory');
  const t = useTranslations('inventory.lotes');
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState('');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createLoteSchema),
    defaultValues: { insumoId: insumo?.id ?? '' },
  });

  useEffect(() => {
    getProveedores().then((r) => {
      if (r.ok) setProveedores(r.value.filter((p) => p.activo));
    });
  }, []);

  useEffect(() => {
    if (!insumo) return;
    setLoadingLotes(true);
    setLotes([]);
    getLotesByInsumo(insumo.id).then((result) => {
      if (result.ok) setLotes(result.value);
      setLoadingLotes(false);
    });
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

  const unidad = insumo
    ? tInv.has(`unidad.${insumo.unidadMedida}`)
      ? tInv(`unidad.${insumo.unidadMedida as UnidadKey}`)
      : insumo.unidadMedida
    : '';

  const expiryLabel = (fechaVencimiento: string | null): string => {
    if (!fechaVencimiento) return t('vencimientoOpcional');
    const diff = new Date(fechaVencimiento).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return t('vencidoHaceDias', { n: Math.abs(days) });
    if (days === 0) return t('venceHoy');
    if (days === 1) return t('venceManana');
    return fechaVencimiento;
  };

  return (
    <Sheet open={!!insumo} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            {t('title', { insumo: insumo?.nombre ?? '' })}
          </SheetTitle>
          <SheetDescription>
            {t('stockActual')}{' '}
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
              {t('loading')}
            </div>
          ) : lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('empty')}</p>
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
            {t('agregarLote')}
          </Button>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-3 border border-border rounded-md p-4"
          >
            <p className="text-sm font-medium">{t('nuevoLote')}</p>

            <input type="hidden" {...register('insumoId')} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cantidadInicial">
                  {t('cantidadInicial')} *{' '}
                  <span className="text-muted-foreground font-normal">({unidad})</span>
                </Label>
                <Input
                  id="cantidadInicial"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder={t('cantidadPlaceholder')}
                  {...register('cantidadInicial', { valueAsNumber: true })}
                />
                {errors.cantidadInicial && (
                  <p className="text-xs text-destructive">{errors.cantidadInicial.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fechaVencimiento">
                  {t('fechaVencimiento')}{' '}
                  <span className="text-muted-foreground font-normal">{t('optional')}</span>
                </Label>
                <Input id="fechaVencimiento" type="date" {...register('fechaVencimiento')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proveedorId">
                  {t('proveedor')}{' '}
                  <span className="text-muted-foreground font-normal">{t('optional')}</span>
                </Label>
                {proveedores.length > 0 ? (
                  <select
                    id="proveedorId"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    {...register('proveedorId')}
                    onChange={(e) => {
                      const selected = proveedores.find((p) => p.id === e.target.value);
                      setValue('proveedorId', e.target.value || undefined);
                      setValue('proveedor', selected?.nombre ?? '');
                    }}
                  >
                    <option value="">{t('sinProveedor')}</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="proveedorId"
                    placeholder={t('proveedorPlaceholder')}
                    {...register('proveedor')}
                  />
                )}
                <input type="hidden" {...register('proveedor')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="costoUnitario">
                  {t('costo')} / {unidad}{' '}
                  <span className="text-muted-foreground font-normal">{t('costoMoneda')}</span>
                </Label>
                <Input
                  id="costoUnitario"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={t('cantidadPlaceholder')}
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
                    {t('guardando')}
                  </>
                ) : (
                  t('guardar')
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
                {t('cancelar')}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
