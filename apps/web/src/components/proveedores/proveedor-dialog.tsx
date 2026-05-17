'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProveedorSchema } from '@dorado/shared-validation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { Textarea } from '@/components/ui/textarea';
import { createProveedor, updateProveedor } from '@/modules/proveedores/actions';
import { toast } from 'sonner';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { z } from 'zod';

type CreateFields = z.infer<typeof createProveedorSchema>;

interface ProveedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proveedor?: Proveedor | undefined;
  onSaved: (p: Proveedor) => void;
}

export function ProveedorDialog({ open, onOpenChange, proveedor, onSaved }: ProveedorDialogProps) {
  const t = useTranslations('proveedores');
  const tF = useTranslations('proveedores.form');
  const isEdit = Boolean(proveedor);
  const [loading, setLoading] = useState(false);

  const form = useForm<CreateFields>({
    resolver: zodResolver(createProveedorSchema),
    defaultValues: {
      nombre: proveedor?.nombre ?? '',
      contacto: proveedor?.contacto ?? '',
      telefono: proveedor?.telefono ?? '',
      email: proveedor?.email ?? '',
      notas: proveedor?.notas ?? '',
    },
  });

  const onSubmit = async (values: CreateFields) => {
    setLoading(true);
    const result =
      isEdit && proveedor
        ? await updateProveedor(proveedor.id, values)
        : await createProveedor(values);
    setLoading(false);

    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(isEdit ? t('actualizado') : t('creado'));
    onSaved(result.value);
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? tF('edit') : tF('create')}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('nombre')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={tF('nombrePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="contacto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tF('contacto')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tF('contactoPlaceholder')}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tF('telefono')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={tF('telefonoPlaceholder')}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={tF('emailPlaceholder')}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('notas')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={tF('notasPlaceholder')}
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tF('cancelar')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? tF('guardando') : isEdit ? tF('guardarCambios') : tF('crear')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
