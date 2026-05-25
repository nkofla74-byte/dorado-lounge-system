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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { solicitarPreparacion } from '@/modules/buffet/actions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnviado: () => void;
}

type Destino = 'cocina' | 'pasteleria';

export function SolicitarPreparacionDialog({ open, onOpenChange, onEnviado }: Props) {
  const t = useTranslations('buffet.preparacion');
  const [error, setError] = useState<string | null>(null);
  const [destino, setDestino] = useState<Destino>('cocina');

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

    const result = await solicitarPreparacion({
      descripcion: values.descripcion,
      destino,
    });

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    form.reset();
    setDestino('cocina');
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
            <div className="space-y-1.5">
              <Label>{t('destinoLabel')}</Label>
              <div className="flex rounded-md border border-input overflow-hidden h-9">
                <button
                  type="button"
                  onClick={() => setDestino('cocina')}
                  className={cn(
                    'px-3 text-sm font-medium transition-colors flex-1',
                    destino === 'cocina'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t('destinoCocina')}
                </button>
                <button
                  type="button"
                  onClick={() => setDestino('pasteleria')}
                  className={cn(
                    'px-3 text-sm font-medium border-l border-input transition-colors flex-1',
                    destino === 'pasteleria'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t('destinoPasteleria')}
                </button>
              </div>
            </div>

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
