'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { registrarIngresoSchema } from '@dorado/shared-validation';
import { registrarIngreso } from '@/modules/afluencia/actions';
import type { RegistrarIngresoInput } from '@dorado/shared-validation';

interface Props {
  turnoId: string;
  onSuccess: () => void;
}

export function RegistrarIngresoDialog({ turnoId, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<RegistrarIngresoInput>({
    resolver: zodResolver(registrarIngresoSchema),
    defaultValues: {
      turnoId,
      cantidad: 1,
      zona: null,
      vueloNumero: null,
    },
  });

  const onSubmit = async (values: RegistrarIngresoInput) => {
    setLoading(true);
    try {
      const result = await registrarIngreso({
        ...values,
        turnoId,
        vueloNumero: values.vueloNumero?.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        `${values.cantidad} pasajero${values.cantidad !== 1 ? 's' : ''} registrado${values.cantidad !== 1 ? 's' : ''}`,
      );
      form.reset({ turnoId, cantidad: 1, zona: null, vueloNumero: null });
      setOpen(false);
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          Registrar ingreso
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ingreso de pasajeros</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de pasajeros</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Ej. 15"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zona"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zona (opcional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === 'todas' ? null : v)}
                    defaultValue="todas"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar zona" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="todas">Todas las zonas</SelectItem>
                      <SelectItem value="amex">Amex</SelectItem>
                      <SelectItem value="snack">Snack</SelectItem>
                      <SelectItem value="buffet">Buffet</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="vueloNumero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de vuelo (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej. AV101"
                      maxLength={10}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Registrando...' : 'Registrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
