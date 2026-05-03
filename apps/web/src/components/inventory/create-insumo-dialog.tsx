'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { createInsumoSchema } from '@dorado/shared-validation';
import { createInsumo } from '@/modules/inventory/actions';
import {
  Dialog,
  DialogContent,
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
import type { z } from 'zod';

type FormInput = z.input<typeof createInsumoSchema>;
type FormOutput = z.output<typeof createInsumoSchema>;

interface CreateInsumoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateInsumoDialog({ open, onOpenChange, onCreated }: CreateInsumoDialogProps) {
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createInsumoSchema),
    defaultValues: { stockMinimo: 0 },
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createInsumo(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    reset();
    onCreated();
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo insumo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              {...register('nombre')}
              placeholder="Ej: Harina de trigo"
              autoFocus
            />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>

          {/* Código */}
          <div className="space-y-1.5">
            <Label htmlFor="codigo">
              Código interno <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input id="codigo" {...register('codigo')} placeholder="Ej: HRN-001" />
          </div>

          {/* Capa + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Capa *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('capa', v as FormInput['capa'], { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capa_1">Bodega (Capa 1)</SelectItem>
                  <SelectItem value="capa_2">Producción (Capa 2)</SelectItem>
                </SelectContent>
              </Select>
              {errors.capa && <p className="text-xs text-destructive">{errors.capa.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Unidad *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('unidadMedida', v as FormInput['unidadMedida'], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                  <SelectItem value="g">Gramos (g)</SelectItem>
                  <SelectItem value="l">Litros (L)</SelectItem>
                  <SelectItem value="ml">Mililitros (mL)</SelectItem>
                  <SelectItem value="unidad">Unidad</SelectItem>
                  <SelectItem value="porcion">Porción</SelectItem>
                </SelectContent>
              </Select>
              {errors.unidadMedida && (
                <p className="text-xs text-destructive">{errors.unidadMedida.message}</p>
              )}
            </div>
          </div>

          {/* Stock mínimo */}
          <div className="space-y-1.5">
            <Label htmlFor="stockMinimo">Stock mínimo</Label>
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

          {/* Error del servidor */}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar insumo'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
