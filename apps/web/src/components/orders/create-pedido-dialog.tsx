'use client';

import { useState, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createPedidoSchema } from '@dorado/shared-validation';
import { createPedido } from '@/modules/orders/actions';
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
import type { RecetaWithIngredientes } from '@/modules/recipes/domain/recipe';
import type { ZonaServicio } from '@/modules/orders/domain/pedido';
import type { z } from 'zod';

type FormInput = z.input<typeof createPedidoSchema>;
type FormOutput = z.output<typeof createPedidoSchema>;

interface CreatePedidoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  recetas: RecetaWithIngredientes[];
  defaultZona?: ZonaServicio;
}

const ZONA_LABELS: Record<ZonaServicio, string> = {
  amex: 'Amex',
  snack: 'Snack',
  buffet: 'Buffet',
};

const genKey = () => `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function CreatePedidoDialog({
  open,
  onOpenChange,
  onCreated,
  recetas,
  defaultZona = 'amex',
}: CreatePedidoDialogProps) {
  const [serverError, setServerError] = useState('');
  const idempotencyKeyRef = useRef(genKey());

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createPedidoSchema),
    defaultValues: {
      zona: defaultZona,
      idempotencyKey: idempotencyKeyRef.current,
      items: [{ recetaId: '', cantidad: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createPedido(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    idempotencyKeyRef.current = genKey();
    reset({
      zona: defaultZona,
      idempotencyKey: idempotencyKeyRef.current,
      items: [{ recetaId: '', cantidad: 1 }],
    });
    onCreated();
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset({
        zona: defaultZona,
        idempotencyKey: idempotencyKeyRef.current,
        items: [{ recetaId: '', cantidad: 1 }],
      });
      setServerError('');
    }
    onOpenChange(isOpen);
  };

  const formErrors = errors as Record<string, { message?: string }>;
  const itemErrors = (errors.items ?? []) as Array<
    { recetaId?: { message?: string }; cantidad?: { message?: string } } | undefined
  >;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
          <DialogDescription className="sr-only">
            Registra un pedido por zona con una o más recetas de servicio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Zona + Mesa */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Zona *</Label>
              <Select
                defaultValue={defaultZona}
                onValueChange={(v) => setValue('zona', v as ZonaServicio, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['amex', 'snack', 'buffet'] as ZonaServicio[]).map((z) => (
                    <SelectItem key={z} value={z}>
                      {ZONA_LABELS[z]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.zona && (
                <p className="text-xs text-destructive">{formErrors.zona.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="numeroMesa">
                Mesa <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input id="numeroMesa" placeholder="Ej. A3, VIP-1" {...register('numeroMesa')} />
            </div>
          </div>

          {/* Ítems */}
          <div className="space-y-2">
            <Label>Ítems *</Label>

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                {/* Receta selector */}
                <div className="flex-1 space-y-1">
                  <Select
                    onValueChange={(v) =>
                      setValue(`items.${index}.recetaId`, v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar receta" />
                    </SelectTrigger>
                    <SelectContent>
                      {recetas.length === 0 ? (
                        <SelectItem value="_empty" disabled>
                          No hay recetas de servicio
                        </SelectItem>
                      ) : (
                        recetas.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.nombre}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {itemErrors[index]?.recetaId && (
                    <p className="text-xs text-destructive">
                      {itemErrors[index]?.recetaId?.message}
                    </p>
                  )}
                </div>

                {/* Cantidad */}
                <div className="w-20 space-y-1">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    className="h-9"
                    {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                  />
                  {itemErrors[index]?.cantidad && (
                    <p className="text-xs text-destructive">
                      {itemErrors[index]?.cantidad?.message}
                    </p>
                  )}
                </div>

                {/* Remove */}
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => append({ recetaId: '', cantidad: 1 })}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Agregar ítem
            </Button>

            {formErrors.items && typeof formErrors.items.message === 'string' && (
              <p className="text-xs text-destructive">{formErrors.items.message}</p>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notas">
              Notas <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <textarea
              id="notas"
              rows={2}
              placeholder="Instrucciones especiales, alergias…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              {...register('notas')}
            />
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
            <Button type="submit" disabled={isSubmitting || recetas.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Crear pedido'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
