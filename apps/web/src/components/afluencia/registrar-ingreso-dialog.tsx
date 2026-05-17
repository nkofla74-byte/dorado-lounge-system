'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('afluencia');
  const tZ = useTranslations('zonas');
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
      toast.success(t('registradoToast', { n: values.cantidad }));
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
          {t('registrarIngreso')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('registrarTitle')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('cantidad')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder={t('cantidadPlaceholder')}
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
                  <FormLabel>{t('zona')}</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === 'todas' ? null : v)}
                    defaultValue="todas"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('zonaPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="todas">{t('todasLasZonas')}</SelectItem>
                      <SelectItem value="amex">{tZ('amex')}</SelectItem>
                      <SelectItem value="snack">{tZ('snack')}</SelectItem>
                      <SelectItem value="buffet">{tZ('buffet')}</SelectItem>
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
                  <FormLabel>{t('vuelo')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('vueloPlaceholder')}
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
                {t('cancelar')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t('submitting') : t('submit')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
