'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { createTandaSchema } from '@dorado/shared-validation';
import { createTanda } from '@/modules/production/actions';
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
import type { z } from 'zod';

type FormInput = z.input<typeof createTandaSchema>;
type FormOutput = z.output<typeof createTandaSchema>;

interface CreateTandaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  recetas: RecetaWithIngredientes[];
}

export function CreateTandaDialog({
  open,
  onOpenChange,
  onCreated,
  recetas,
}: CreateTandaDialogProps) {
  const [serverError, setServerError] = useState('');

  const genKey = () => `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKeyRef = useRef(genKey());

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createTandaSchema),
    defaultValues: { cantidadTandas: 1, idempotencyKey: idempotencyKeyRef.current },
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createTanda(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    idempotencyKeyRef.current = genKey();
    reset({ cantidadTandas: 1, idempotencyKey: idempotencyKeyRef.current });
    onCreated();
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset({ cantidadTandas: 1, idempotencyKey: idempotencyKeyRef.current });
      setServerError('');
    }
    onOpenChange(open);
  };

  const formErrors = errors as Record<string, { message?: string }>;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tanda de producción</DialogTitle>
          <DialogDescription className="sr-only">
            Programa una tanda a partir de una receta de producción existente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Receta */}
          <div className="space-y-1.5">
            <Label>Receta *</Label>
            <Select onValueChange={(v) => setValue('recetaId', v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar receta de producción" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const con = recetas.filter((r) => r.ingredientes.length > 0);
                  return con.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      No hay recetas con ingredientes
                    </SelectItem>
                  ) : (
                    con.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({r.ingredientes.length} ing.)
                        </span>
                      </SelectItem>
                    ))
                  );
                })()}
              </SelectContent>
            </Select>
            {formErrors.recetaId && (
              <p className="text-xs text-destructive">{formErrors.recetaId.message}</p>
            )}
          </div>

          {/* Cantidad de tandas */}
          <div className="space-y-1.5">
            <Label htmlFor="cantidadTandas">Cantidad de tandas *</Label>
            <Input
              id="cantidadTandas"
              type="number"
              min="1"
              step="1"
              {...register('cantidadTandas', { valueAsNumber: true })}
            />
            {formErrors.cantidadTandas && (
              <p className="text-xs text-destructive">{formErrors.cantidadTandas.message}</p>
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
              placeholder="Observaciones, instrucciones especiales…"
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
            <Button
              type="submit"
              disabled={
                isSubmitting || recetas.filter((r) => r.ingredientes.length > 0).length === 0
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Crear tanda'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
