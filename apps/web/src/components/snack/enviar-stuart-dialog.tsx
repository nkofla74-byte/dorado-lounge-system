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
import { Textarea } from '@/components/ui/textarea';
import { enviarStuart } from '@/modules/snack/actions';

interface EnviarStuartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnviado: () => void;
}

export function EnviarStuartDialog({ open, onOpenChange, onEnviado }: EnviarStuartDialogProps) {
  const t = useTranslations('snack.stuart');
  const [error, setError] = useState<string | null>(null);

  const formSchema = z.object({
    descripcion: z.string().min(1, t('errorDescripcion')).max(500),
  });

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { descripcion: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);

    const result = await enviarStuart({ descripcion: values.descripcion });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset();
    onOpenChange(false);
    onEnviado();
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
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('label')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('placeholder')}
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
