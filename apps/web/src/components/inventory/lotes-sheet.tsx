'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createLoteSchema } from '@dorado/shared-validation';
import { getLotesByInsumo, createLote } from '@/modules/inventory/actions';
import { getProveedores, deleteProveedor } from '@/modules/proveedores/actions';
import { ProveedorDialog } from '@/components/proveedores/proveedor-dialog';
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
  // Si true, el sheet abre con el formulario de nuevo lote desplegado.
  // Útil para botones "Ingresar lote" que deben llevar directo al form.
  openInForm?: boolean;
}

type UnidadKey = 'g' | 'ml' | 'unidad';

function expiryClass(fechaVencimiento: string | null): string {
  if (!fechaVencimiento) return 'text-muted-foreground';
  const diff = new Date(fechaVencimiento).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return 'text-destructive font-medium';
  if (days < 7) return 'text-senal-aviso font-medium';
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
  const [provDialogOpen, setProvDialogOpen] = useState(false);
  const [provEditing, setProvEditing] = useState<Proveedor | undefined>(undefined);
  const [provDeleting, setProvDeleting] = useState(false);
  const [selectedProvId, setSelectedProvId] = useState<string>('');

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

  const reloadProveedores = async () => {
    const r = await getProveedores();
    if (r.ok) setProveedores(r.value.filter((p) => p.activo));
  };

  useEffect(() => {
    void reloadProveedores();
  }, []);

  const handleProvSaved = (p: Proveedor) => {
    void reloadProveedores();
    // Auto-seleccionar el proveedor recién creado/editado en el form de lote
    setSelectedProvId(p.id);
    setValue('proveedorId', p.id);
    setValue('proveedor', p.nombre);
  };

  const handleProvDelete = async () => {
    if (!selectedProvId) return;
    const sel = proveedores.find((p) => p.id === selectedProvId);
    if (!sel) return;
    if (!confirm(`¿Eliminar proveedor "${sel.nombre}"? Esta acción no se puede deshacer.`)) return;
    setProvDeleting(true);
    const r = await deleteProveedor(selectedProvId);
    setProvDeleting(false);
    if (!r.ok) {
      toast.error(r.error.message);
      return;
    }
    toast.success('Proveedor eliminado');
    setSelectedProvId('');
    setValue('proveedorId', undefined);
    setValue('proveedor', '');
    void reloadProveedores();
  };

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
                  <span className={cn('text-caption', expiryClass(lote.fechaVencimiento))}>
                    {expiryLabel(lote.fechaVencimiento)}
                  </span>
                </div>
                {lote.proveedor && (
                  <p className="text-caption text-muted-foreground">{lote.proveedor}</p>
                )}
                {lote.costoUnitario !== null && (
                  <p className="text-caption text-muted-foreground">
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
                  <p className="text-caption text-destructive">{errors.cantidadInicial.message}</p>
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
                <div className="flex items-center gap-1">
                  {proveedores.length > 0 ? (
                    <select
                      id="proveedorId"
                      className="flex-1 min-w-0 min-h-11 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={selectedProvId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const selected = proveedores.find((p) => p.id === id);
                        setSelectedProvId(id);
                        setValue('proveedorId', id || undefined);
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
                      className="flex-1"
                      placeholder={t('proveedorPlaceholder')}
                      {...register('proveedor')}
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0"
                    title="Nuevo proveedor"
                    onClick={() => {
                      setProvEditing(undefined);
                      setProvDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    title="Editar proveedor seleccionado"
                    disabled={!selectedProvId}
                    onClick={() => {
                      const sel = proveedores.find((p) => p.id === selectedProvId);
                      if (!sel) return;
                      setProvEditing(sel);
                      setProvDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-destructive hover:text-destructive"
                    title="Eliminar proveedor seleccionado"
                    disabled={!selectedProvId || provDeleting}
                    onClick={handleProvDelete}
                  >
                    {provDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <input type="hidden" {...register('proveedorId')} />
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

      <ProveedorDialog
        open={provDialogOpen}
        onOpenChange={(o) => {
          setProvDialogOpen(o);
          if (!o) setProvEditing(undefined);
        }}
        proveedor={provEditing}
        onSaved={handleProvSaved}
      />
    </Sheet>
  );
}
