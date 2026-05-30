'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2 } from 'lucide-react';
import { createMermaSchema } from '@dorado/shared-validation';
import { registrarMerma } from '@/modules/inventory/actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { z } from 'zod';

type FormInput = z.input<typeof createMermaSchema>;
type FormOutput = z.output<typeof createMermaSchema>;

type CategoriaKey = 'operativa' | 'vencimiento' | 'accidente' | 'calidad' | 'otro';
const CATEGORIAS: CategoriaKey[] = ['operativa', 'vencimiento', 'accidente', 'calidad', 'otro'];

type UnidadKey = 'g' | 'ml' | 'unidad';

const genKey = () => `merma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface MermaDialogProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MermaDialog({ insumo, onOpenChange, onSuccess }: MermaDialogProps) {
  const t = useTranslations('inventory');
  const tM = useTranslations('inventory.merma');
  const [serverError, setServerError] = useState('');
  const idempotencyKeyRef = useRef(genKey());

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createMermaSchema),
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
    const result = await registrarMerma(values);
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
      ? t(`unidad.${insumo.unidadMedida as UnidadKey}`)
      : insumo.unidadMedida
    : '';
  const stockFormatted = insumo?.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 });

  return (
    <Dialog open={!!insumo} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-amber-500" />
            {tM('title')}
          </DialogTitle>
          <DialogDescription>
            {tM('subtitle', {
              insumo: insumo?.nombre ?? '',
              stock: stockFormatted ?? '',
              unidad,
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('insumoId')} />
          <input type="hidden" {...register('idempotencyKey')} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cantidad">
                {tM('cantidad')} *{' '}
                <span className="text-muted-foreground font-normal">({unidad})</span>
              </Label>
              <Input
                id="cantidad"
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder={tM('cantidadPlaceholder')}
                autoFocus
                {...register('cantidad', { valueAsNumber: true })}
              />
              {errors.cantidad && (
                <p className="text-xs text-destructive">{errors.cantidad.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria">{tM('categoria')} *</Label>
              <Select
                onValueChange={(val) =>
                  setValue('categoria', val as FormOutput['categoria'], { shouldValidate: true })
                }
              >
                <SelectTrigger id="categoria">
                  <SelectValue placeholder={tM('categoriaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {tM(`categorias.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoria && (
                <p className="text-xs text-destructive">{errors.categoria.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">
              {tM('descripcion')}{' '}
              <span className="text-muted-foreground font-normal">{tM('optional')}</span>
            </Label>
            <Input
              id="descripcion"
              placeholder={tM('descripcionPlaceholder')}
              {...register('descripcion')}
            />
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
              {tM('cancelar')}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tM('procesando')}
                </>
              ) : (
                tM('registrar')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
