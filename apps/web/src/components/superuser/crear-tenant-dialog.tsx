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
import { crearTenantSchema } from '@dorado/shared-validation';
import { crearTenant } from '@/modules/superuser/actions';
import type { CrearTenantInput } from '@dorado/shared-validation';

interface Props {
  onSuccess: () => void;
}

export function CrearTenantDialog({ onSuccess }: Props) {
  const t = useTranslations('admin.tenants');
  const tF = useTranslations('admin.tenants.form');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<CrearTenantInput>({
    resolver: zodResolver(crearTenantSchema),
    defaultValues: { nombre: '', slug: '' },
  });

  const onSubmit = async (values: CrearTenantInput) => {
    setLoading(true);
    try {
      const result = await crearTenant(values);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(tF('creadoToast', { nombre: result.value.nombre }));
      form.reset();
      setOpen(false);
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const handleNombreChange = (nombre: string) => {
    form.setValue('nombre', nombre);
    if (!form.getValues('slug')) {
      form.setValue(
        'slug',
        nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 32),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          {t('nuevo')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tF('title')}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('nombre')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={tF('nombrePlaceholder')}
                      {...field}
                      onChange={(e) => handleNombreChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('slug')}</FormLabel>
                  <FormControl>
                    <Input placeholder={tF('slugPlaceholder')} {...field} />
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
                {tF('cancelar')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? tF('creando') : tF('crear')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
