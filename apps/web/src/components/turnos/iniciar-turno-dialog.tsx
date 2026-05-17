'use client';

import { useState, useEffect } from 'react';
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
import { iniciarTurno, getUsuariosResumen } from '@/modules/turnos/actions';
import type { UsuarioResumen } from '@/modules/turnos/actions';

const OTRO = '__otro__';

interface IniciarTurnoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIniciado: () => void;
}

export function IniciarTurnoDialog({ open, onOpenChange, onIniciado }: IniciarTurnoDialogProps) {
  const t = useTranslations('turnos');
  const [error, setError] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumen[]>([]);
  const [showOtro, setShowOtro] = useState(false);

  useEffect(() => {
    if (!open) return;
    getUsuariosResumen().then((r) => {
      if (r.ok) setUsuarios(r.value);
    });
  }, [open]);

  const formSchema = z.object({
    nombre: z.string().min(1, t('errorNombre')).max(255),
    teamlider: z.string().min(1, t('errorTeamlider')).max(255),
    teamliderSelect: z.string().min(1),
  });

  type FormValues = z.infer<typeof formSchema>;

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
          <DialogTitle>{t('iniciar')}</DialogTitle>
          <DialogDescription className="sr-only">{t('iniciarSrDescription')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('nombre')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('nombrePlaceholder')} {...field} />
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
                  <FormLabel>{t('teamlider')}</FormLabel>
                  <Select onValueChange={handleSelectChange} value={form.watch('teamliderSelect')}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('teamliderSelectPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.nombre}>
                          {u.nombre}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTRO}>{t('teamliderOtro')}</SelectItem>
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
                    <FormLabel>{t('teamliderOtroLabel')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('teamliderOtroPlaceholder')} {...field} />
                    </FormControl>
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
                {form.formState.isSubmitting ? t('iniciando') : t('iniciar')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
