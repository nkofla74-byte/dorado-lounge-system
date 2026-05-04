'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { createRecetaSchema } from '@dorado/shared-validation';
import { createReceta } from '@/modules/recipes/actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { z } from 'zod';

type FormInput = z.input<typeof createRecetaSchema>;
type FormOutput = z.output<typeof createRecetaSchema>;

interface CreateRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  insumosCapa2: InsumoWithStock[];
}

const ZONA_LABEL: Record<string, string> = {
  amex: 'Amex',
  snack: 'Snack',
  buffet: 'Buffet',
};

export function CreateRecipeDialog({
  open,
  onOpenChange,
  onCreated,
  insumosCapa2,
}: CreateRecipeDialogProps) {
  const [serverError, setServerError] = useState('');
  const [tipoReceta, setTipoReceta] = useState<'produccion' | 'servicio' | ''>('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createRecetaSchema),
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createReceta(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    resetForm();
    onCreated();
  };

  const resetForm = () => {
    reset();
    setTipoReceta('');
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const formErrors = errors as Record<string, { message?: string }>;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva receta</DialogTitle>
          <DialogDescription className="sr-only">
            Crea una receta de producción o servicio con su configuración base.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" {...register('nombre')} placeholder="Ej: Pandebono x12" autoFocus />
            {formErrors.nombre && (
              <p className="text-xs text-destructive">{formErrors.nombre.message}</p>
            )}
          </div>

          {/* Tipo de receta */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select
              onValueChange={(v: 'produccion' | 'servicio') => {
                setTipoReceta(v);
                setValue('tipoReceta', v, { shouldValidate: true });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produccion">Producción (Capa 1 → Capa 2)</SelectItem>
                <SelectItem value="servicio">Servicio (despacho a zona)</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.tipoReceta && (
              <p className="text-xs text-destructive">{formErrors.tipoReceta.message}</p>
            )}
          </div>

          {/* Condicional: Producción → insumo destino | Servicio → zona */}
          {tipoReceta === 'produccion' && (
            <div className="space-y-1.5">
              <Label>Insumo destino (Capa 2) *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('insumoDestinoId' as keyof FormInput, v as never, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar insumo" />
                </SelectTrigger>
                <SelectContent>
                  {insumosCapa2.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      No hay insumos en Capa 2
                    </SelectItem>
                  ) : (
                    insumosCapa2.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.nombre}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {formErrors.insumoDestinoId && (
                <p className="text-xs text-destructive">{formErrors.insumoDestinoId.message}</p>
              )}
            </div>
          )}

          {tipoReceta === 'servicio' && (
            <div className="space-y-1.5">
              <Label>Zona de servicio *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('zona' as keyof FormInput, v as never, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar zona" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ZONA_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.zona && (
                <p className="text-xs text-destructive">{formErrors.zona.message}</p>
              )}
            </div>
          )}

          {/* Porciones */}
          <div className="space-y-1.5">
            <Label htmlFor="porciones">Porciones *</Label>
            <Input
              id="porciones"
              type="number"
              min="1"
              step="1"
              placeholder="1"
              {...register('porciones', { valueAsNumber: true })}
            />
            {formErrors.porciones && (
              <p className="text-xs text-destructive">{formErrors.porciones.message}</p>
            )}
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
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || tipoReceta === ''}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar receta'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
