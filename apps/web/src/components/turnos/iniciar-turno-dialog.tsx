'use client';

import { useState, useEffect } from 'react';
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
import { iniciarTurno, getUsuariosResumen } from '@/modules/turnos/actions';
import type { UsuarioResumen } from '@/modules/turnos/actions';

const OTRO = '__otro__';

const formSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(255),
  teamlider: z.string().min(1, 'El jefe de turno es obligatorio').max(255),
  teamliderSelect: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

interface IniciarTurnoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIniciado: () => void;
}

export function IniciarTurnoDialog({ open, onOpenChange, onIniciado }: IniciarTurnoDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumen[]>([]);
  const [showOtro, setShowOtro] = useState(false);

  useEffect(() => {
    if (!open) return;
    getUsuariosResumen().then((r) => {
      if (r.ok) setUsuarios(r.value);
    });
  }, [open]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: '', teamlider: '', teamliderSelect: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const result = await iniciarTurno({ nombre: values.nombre, teamlider: values.teamlider });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset();
    setShowOtro(false);
    onOpenChange(false);
    onIniciado();
  };

  const handleSelectChange = (value: string) => {
    form.setValue('teamliderSelect', value, { shouldValidate: true });
    if (value === OTRO) {
      setShowOtro(true);
      form.setValue('teamlider', '', { shouldValidate: false });
    } else {
      setShowOtro(false);
      form.setValue('teamlider', value, { shouldValidate: true });
    }
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

            <FormField
              control={form.control}
              name="teamliderSelect"
              render={() => (
                <FormItem>
                  <FormLabel>Jefe de turno (Teamlider)</FormLabel>
                  <Select onValueChange={handleSelectChange} value={form.watch('teamliderSelect')}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un responsable…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.nombre}>
                          {u.nombre}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTRO}>Otro…</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showOtro && (
              <FormField
                control={form.control}
                name="teamlider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del responsable</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo" {...field} />
                    </FormControl>
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
                {form.formState.isSubmitting ? 'Iniciando…' : 'Iniciar turno'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
