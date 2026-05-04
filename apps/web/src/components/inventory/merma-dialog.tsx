'use client';

import { useRef, useState } from 'react';
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

const CATEGORIA_LABEL: Record<string, string> = {
  operativa: 'Operativa',
  vencimiento: 'Vencimiento',
  accidente: 'Accidente',
  calidad: 'Calidad',
  otro: 'Otro',
};

const CATEGORIAS = Object.keys(CATEGORIA_LABEL) as (keyof typeof CATEGORIA_LABEL)[];

const UNIDAD_LABEL: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  l: 'L',
  ml: 'mL',
  unidad: 'und',
  porcion: 'porc',
};

const genKey = () => `merma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface MermaDialogProps {
  insumo: InsumoWithStock | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MermaDialog({ insumo, onOpenChange, onSuccess }: MermaDialogProps) {
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

  const unidad = insumo ? (UNIDAD_LABEL[insumo.unidadMedida] ?? insumo.unidadMedida) : '';

  return (
    <Dialog open={!!insumo} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-amber-500" />
            Registrar merma
          </DialogTitle>
          <DialogDescription>
            {insumo?.nombre} — Stock actual:{' '}
            <span className="font-semibold text-foreground">
              {insumo?.stockActual.toLocaleString('es-CO', { maximumFractionDigits: 4 })} {unidad}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('insumoId')} />
          <input type="hidden" {...register('idempotencyKey')} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cantidad">
                Cantidad * <span className="text-muted-foreground font-normal">({unidad})</span>
              </Label>
              <Input
                id="cantidad"
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.00"
                autoFocus
                {...register('cantidad', { valueAsNumber: true })}
              />
              {errors.cantidad && (
                <p className="text-xs text-destructive">{errors.cantidad.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoría *</Label>
              <Select
                onValueChange={(val) =>
                  setValue('categoria', val as FormOutput['categoria'], { shouldValidate: true })
                }
              >
                <SelectTrigger id="categoria">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORIA_LABEL[cat]}
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
              Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="descripcion"
              placeholder="Describe la causa de la merma"
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
              Cancelar
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
                  Registrando…
                </>
              ) : (
                'Registrar merma'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
