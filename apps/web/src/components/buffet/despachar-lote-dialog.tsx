'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { despacharLoteBuffet } from '@/modules/buffet/actions';
import type { TurnoActivo } from '@/modules/buffet/domain/ticket-turno';

const formSchema = z.object({
  recetaId: z.string().uuid('Selecciona una receta'),
  cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor que 0'),
  turnoId: z.string().uuid().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Receta {
  id: string;
  nombre: string;
  porciones: number;
}

interface DespacharLoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDespachado: () => void;
  recetas: Receta[];
  turnos: TurnoActivo[];
}

export function DespacharLoteDialog({
  open,
  onOpenChange,
  onDespachado,
  recetas,
  turnos,
}: DespacharLoteDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { cantidad: 1 },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const idempotencyKey = `despacho:buffet:${values.recetaId}:${Date.now()}`;

    const result = await despacharLoteBuffet({
      recetaId: values.recetaId,
      cantidad: values.cantidad,
      turnoId: values.turnoId || undefined,
      idempotencyKey,
    });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset({ cantidad: 1 });
    onOpenChange(false);
    onDespachado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Despachar lote al buffet</DialogTitle>
          <DialogDescription className="sr-only">
            Registra el despacho de un lote de receta al buffet y descuenta inventario FEFO.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="recetaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receta</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una receta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {recetas.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nombre}
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({r.porciones} porc/batch)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de batches</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} step={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {turnos.length > 0 && (
              <FormField
                control={form.control}
                name="turnoId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Turno (opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin turno asignado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {turnos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Despachando…' : 'Despachar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
