'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { updateInsumoSchema } from '@dorado/shared-validation';
import { updateInsumo } from '@/modules/inventory/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { z } from 'zod';

type FormInput = z.input<typeof updateInsumoSchema>;
type FormOutput = z.output<typeof updateInsumoSchema>;

interface EditInsumoDialogProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditInsumoDialog({ insumo, onOpenChange, onSaved }: EditInsumoDialogProps) {
  const t = useTranslations('inventory.editInsumo');
  const tCreate = useTranslations('inventory.createInsumo');
  const [serverError, setServerError] = useState('');
  const [mermaPct, setMermaPct] = useState('0');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateInsumoSchema),
  });

  useEffect(() => {
    if (insumo) {
      reset({
        id: insumo.id,
        nombre: insumo.nombre,
        stockMinimo: insumo.stockMinimo,
        mermaDefault: insumo.mermaDefault,
      });
      const pct =
        insumo.mermaDefault > 0
          ? (insumo.mermaDefault * 100).toFixed(2).replace(/\.?0+$/, '')
          : '0';
      setMermaPct(pct);
      setServerError('');
    }
  }, [insumo, reset]);

  const handleMermaChange = (raw: string) => {
    setMermaPct(raw);
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0 && num < 100) {
      setValue('mermaDefault', num / 100, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await updateInsumo(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
      setMermaPct('0');
      setServerError('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={insumo !== null} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { nombre: insumo?.nombre ?? '' })}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <input type="hidden" {...register('id')} />

          <div className="space-y-1.5">
            <Label htmlFor="nombre">{tCreate('nombre')} *</Label>
            <Input id="nombre" {...register('nombre')} autoFocus />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stockMinimo">{tCreate('stockMinimo')}</Label>
              <Input
                id="stockMinimo"
                type="number"
                step="0.0001"
                min="0"
                {...register('stockMinimo', { valueAsNumber: true })}
              />
              {errors.stockMinimo && (
                <p className="text-xs text-destructive">{errors.stockMinimo.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mermaDefault">{tCreate('mermaDefault')}</Label>
              <div className="relative">
                <Input
                  id="mermaDefault"
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.99"
                  value={mermaPct}
                  onChange={(e) => handleMermaChange(e.target.value)}
                  className="pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>
              {errors.mermaDefault && (
                <p className="text-xs text-destructive">{errors.mermaDefault.message}</p>
              )}
              <p className="text-xs text-muted-foreground">{tCreate('mermaDefaultHint')}</p>
            </div>
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              {tCreate('cancelar')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('guardando')}
                </>
              ) : (
                t('guardar')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
