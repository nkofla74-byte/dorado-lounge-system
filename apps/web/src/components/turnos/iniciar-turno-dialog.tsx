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
import { Input } from '@/components/ui/input';
import { iniciarTurno } from '@/modules/turnos/actions';

const formSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
});

type FormValues = z.infer<typeof formSchema>;

interface IniciarTurnoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIniciado: () => void;
}

export function IniciarTurnoDialog({ open, onOpenChange, onIniciado }: IniciarTurnoDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const result = await iniciarTurno({ nombre: values.nombre });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset();
    onOpenChange(false);
    onIniciado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Iniciar turno</DialogTitle>
          <DialogDescription className="sr-only">
            Crea un nuevo turno operativo. Solo puede haber un turno activo a la vez.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del turno</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Turno A — 06:00–14:00" {...field} />
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
                {form.formState.isSubmitting ? 'Iniciando…' : 'Iniciar turno'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
