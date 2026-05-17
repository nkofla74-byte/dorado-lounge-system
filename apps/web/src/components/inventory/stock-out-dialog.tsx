'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TrendingDown } from 'lucide-react';
import { stockOutSchema } from '@dorado/shared-validation';
import { stockOut } from '@/modules/inventory/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { z } from 'zod';

type FormInput = z.input<typeof stockOutSchema>;
type FormOutput = z.output<typeof stockOutSchema>;

const genKey = () => `so-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface StockOutDialogProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function StockOutDialog({ insumo, onOpenChange, onSuccess }: StockOutDialogProps) {
  const t = useTranslations('inventory');
  const tSO = useTranslations('inventory.stockOut');
  const [serverError, setServerError] = useState('');
  const idempotencyKeyRef = useRef(genKey());

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(stockOutSchema),
    defaultValues: {
      insumoId: insumo?.id ?? '',
      idempotencyKey: idempotencyKeyRef.current,
    },
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset({ insumoId: insumo?.id ?? '', idempotencyKey: idempotencyKeyRef.current });
      setServerError('');
    }
    onOpenChange(open);
  };

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await stockOut(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    idempotencyKeyRef.current = genKey();
    reset({ insumoId: insumo?.id ?? '', idempotencyKey: idempotencyKeyRef.current });
    onOpenChange(false);
    onSuccess?.();
  };

  const unidad = insumo
    ? t.has(`unidad.${insumo.unidadMedida}`)
      ? t(
          `unidad.${insumo.unidadMedida}` as
            | 'unidad.kg'
            | 'unidad.g'
            | 'unidad.l'
            | 'unidad.ml'
            | 'unidad.unidad'
            | 'unidad.porcion',
        )
      : insumo.unidadMedida
    : '';
  const stockFormatted = insumo?.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 });

  return (
    <Dialog open={!!insumo} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            {tSO('title')}
          </DialogTitle>
          <DialogDescription>
            {tSO.rich('subtitle', {
              insumo: insumo?.nombre ?? '',
              stock: stockFormatted ?? '',
              unidad,
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('insumoId')} />
          <input type="hidden" {...register('idempotencyKey')} />

          <div className="space-y-1.5">
            <Label htmlFor="cantidad">
              {tSO('cantidad')} *{' '}
              <span className="text-muted-foreground font-normal">({unidad})</span>
            </Label>
            <Input
              id="cantidad"
              type="number"
              step="0.0001"
              min="0.0001"
              placeholder={tSO('cantidadPlaceholder')}
              autoFocus
              {...register('cantidad', { valueAsNumber: true })}
            />
            {errors.cantidad && (
              <p className="text-xs text-destructive">{errors.cantidad.message}</p>
            )}
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              {tSO('cancelar')}
            </Button>
            <Button type="submit" size="sm" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tSO('procesando')}
                </>
              ) : (
                tSO('confirmar')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
