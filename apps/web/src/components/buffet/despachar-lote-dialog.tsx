'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('buffet.despachar');
  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    recetaId: z.string().uuid(t('errorReceta')),
    cantidad: z.coerce.number().int().positive(t('errorCantidad')),
    turnoId: z.string().uuid().optional(),
  });

  type FormValues = z.infer<typeof formSchema>;

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
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="recetaId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('receta')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('recetaPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {recetas.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.nombre}
                          <span className="text-muted-foreground ml-2 text-xs">
                            {t('porcSuffix', { n: r.porciones })}
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
                  <FormLabel>{t('cantidad')}</FormLabel>
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
                    <FormLabel>{t('turno')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('turnoPlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {turnos.map((tu) => (
                          <SelectItem key={tu.id} value={tu.id}>
                            {tu.nombre}
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
                {t('cancelar')}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t('submitting') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
