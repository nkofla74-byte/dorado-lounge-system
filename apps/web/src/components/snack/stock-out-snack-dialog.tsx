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
import { stockOut } from '@/modules/inventory/actions';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';

const formSchema = z.object({
  insumoId: z.string().uuid('Selecciona un insumo'),
  cantidad: z.coerce
    .number()
    .positive('La cantidad debe ser mayor que 0')
    .multipleOf(0.0001, 'Máximo 4 decimales'),
});

type FormValues = z.infer<typeof formSchema>;

interface StockOutSnackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistrado: () => void;
  insumos: InsumoWithStock[];
}

export function StockOutSnackDialog({
  open,
  onOpenChange,
  onRegistrado,
  insumos,
}: StockOutSnackDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const selectedInsumoId = form.watch('insumoId');
  const selectedInsumo = insumos.find((i) => i.id === selectedInsumoId);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const idempotencyKey = `snack:stock_out:${values.insumoId}:${Date.now()}`;

    const result = await stockOut({
      insumoId: values.insumoId,
      cantidad: values.cantidad,
      idempotencyKey,
    });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset();
    onOpenChange(false);
    onRegistrado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Out manual</DialogTitle>
          <DialogDescription className="sr-only">
            Descuenta manualmente insumos del inventario por FEFO.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="insumoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Insumo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un insumo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {insumos.map((ins) => (
                        <SelectItem key={ins.id} value={ins.id}>
                          {ins.nombre}
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({ins.stockActual} {ins.unidadMedida} disp.)
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
                  <FormLabel>
                    Cantidad
                    {selectedInsumo && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({selectedInsumo.unidadMedida})
                      </span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input type="number" min={0.0001} step={0.0001} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Registrando…' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
