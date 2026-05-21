'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { createInsumoSchema } from '@dorado/shared-validation';
import { createInsumo } from '@/modules/inventory/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { z } from 'zod';

type FormInput = z.input<typeof createInsumoSchema>;
type FormOutput = z.output<typeof createInsumoSchema>;

type CapaKey = 'capa_1' | 'capa_2';
type UnidadKey = 'kg' | 'g' | 'l' | 'ml' | 'unidad' | 'porcion';

const CAPAS: CapaKey[] = ['capa_1', 'capa_2'];
const UNIDADES: UnidadKey[] = ['kg', 'g', 'l', 'ml', 'unidad', 'porcion'];

interface CreateInsumoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateInsumoDialog({ open, onOpenChange, onCreated }: CreateInsumoDialogProps) {
  const t = useTranslations('inventory.createInsumo');
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createInsumoSchema),
    defaultValues: { stockMinimo: 0, mermaDefault: 0 },
  });

  const [mermaPct, setMermaPct] = useState('0');

  const handleMermaChange = (raw: string) => {
    setMermaPct(raw);
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 0 && num < 100) {
      setValue('mermaDefault', num / 100, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createInsumo(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    reset();
    setMermaPct('0');
    onCreated();
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset();
      setMermaPct('0');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="nombre">{t('nombre')} *</Label>
            <Input
              id="nombre"
              {...register('nombre')}
              placeholder={t('nombrePlaceholder')}
              autoFocus
            />
            {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
          </div>

          {/* Código */}
          <div className="space-y-1.5">
            <Label htmlFor="codigo">
              {t('codigo')}{' '}
              <span className="text-muted-foreground font-normal">{t('optional')}</span>
            </Label>
            <Input id="codigo" {...register('codigo')} placeholder={t('codigoPlaceholder')} />
          </div>

          {/* Capa + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('capa')} *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('capa', v as FormInput['capa'], { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('seleccionar')} />
                </SelectTrigger>
                <SelectContent>
                  {CAPAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`capas.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.capa && <p className="text-xs text-destructive">{errors.capa.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>{t('unidad')} *</Label>
              <Select
                onValueChange={(v) =>
                  setValue('unidadMedida', v as FormInput['unidadMedida'], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('seleccionar')} />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`unidades.${u}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.unidadMedida && (
                <p className="text-xs text-destructive">{errors.unidadMedida.message}</p>
              )}
            </div>
          </div>

          {/* Stock mínimo + Merma aprox */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stockMinimo">{t('stockMinimo')}</Label>
              <Input
                id="stockMinimo"
                type="number"
                step="0.0001"
                min="0"
                {...register('stockMinimo', { valueAsNumber: true })}
              />
              {errors.stockMinimo && (
                <p className="text-xs text-destructive">{errors.stockMinimo.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mermaDefault">{t('mermaDefault')}</Label>
              <div className="relative">
                <Input
                  id="mermaDefault"
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.99"
                  value={mermaPct}
                  onChange={(e) => handleMermaChange(e.target.value)}
                  className="pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>
              {errors.mermaDefault && (
                <p className="text-xs text-destructive">{errors.mermaDefault.message}</p>
              )}
              <p className="text-xs text-muted-foreground">{t('mermaDefaultHint')}</p>
            </div>
          </div>

          {/* Error del servidor */}
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isSubmitting}
            >
              {t('cancelar')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('guardando')}
                </>
              ) : (
                t('guardar')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
