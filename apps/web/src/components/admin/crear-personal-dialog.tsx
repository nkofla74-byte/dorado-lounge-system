'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
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
import { crearPersonal } from '@/app/(dashboard)/admin/personal/actions';
import { ASSIGNABLE_ROLES } from '@/lib/auth/assignable-roles';
import type { TenantUser } from '@/modules/superuser/domain/superuser';

interface Props {
  onSuccess: (user: TenantUser) => void;
}

export function CrearPersonalDialog({ onSuccess }: Props) {
  const t = useTranslations('admin.personal');
  const tF = useTranslations('admin.users.form');
  const tR = useTranslations('roles');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const formSchema = z.object({
    nombre: z.string().min(2).max(100),
    email: z.string().email(),
    role: z.enum(ASSIGNABLE_ROLES),
    password: z.string().min(8).max(100),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nombre: '', email: '', role: 'chef', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const result = await crearPersonal(values);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(tF('creadoToast', { nombre: result.value.nombre }));
      form.reset();
      setOpen(false);
      onSuccess(result.value);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
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
                    <Input placeholder={tF('nombrePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('email')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder={tF('emailPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('rol')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={tF('rolPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {tR(role)}
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{tF('password')}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={tF('passwordPlaceholder')} {...field} />
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
