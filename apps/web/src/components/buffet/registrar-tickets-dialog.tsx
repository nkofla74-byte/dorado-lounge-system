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
import { registrarTicketsCierre } from '@/modules/buffet/actions';
import type { TurnoActivo } from '@/modules/buffet/domain/ticket-turno';

const formSchema = z.object({
  turnoId: z.string().uuid('Selecciona un turno'),
  cantidadTickets: z.coerce.number().int().min(0, 'La cantidad no puede ser negativa'),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarTicketsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistrado: () => void;
  turnos: TurnoActivo[];
}

export function RegistrarTicketsDialog({
  open,
  onOpenChange,
  onRegistrado,
  turnos,
}: RegistrarTicketsDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { cantidadTickets: 0 },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const idempotencyKey = `tickets:cierre:${values.turnoId}:${Date.now()}`;

    const result = await registrarTicketsCierre({
      turnoId: values.turnoId,
      cantidadTickets: values.cantidadTickets,
      idempotencyKey,
    });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset({ cantidadTickets: 0 });
    onOpenChange(false);
    onRegistrado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar tickets al cierre</DialogTitle>
          <DialogDescription className="sr-only">
            Registra la cantidad de tickets recolectados al cierre del buffet. 1 ticket = 1
            servicio.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="turnoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Turno</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el turno" />
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

            <FormField
              control={form.control}
              name="cantidadTickets"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de tickets</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step={1} {...field} />
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
