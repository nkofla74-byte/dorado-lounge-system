'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { createTandaSchema } from '@dorado/shared-validation';
import { createTanda } from '@/modules/production/actions';
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
import type { RecetaWithIngredientes } from '@/modules/recipes/domain/recipe';
import type { Turno } from '@/modules/turnos/domain/turno';
import type { z } from 'zod';
import { formatBloqueHorario } from '@/lib/turnos';

type FormInput = z.input<typeof createTandaSchema>;
type FormOutput = z.output<typeof createTandaSchema>;

interface CreateTandaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  recetas: RecetaWithIngredientes[];
  turnoActivo: Turno | null;
  responsableNombre: string;
}

export function CreateTandaDialog({
  open,
  onOpenChange,
  onCreated,
  recetas,
  turnoActivo,
  responsableNombre,
}: CreateTandaDialogProps) {
  const t = useTranslations('production.create');
  const [serverError, setServerError] = useState('');

  const genKey = () => `prod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKeyRef = useRef(genKey());

  const baseDefaults = (): Partial<FormInput> => ({
    cantidadTandas: 1,
    idempotencyKey: idempotencyKeyRef.current,
    ...(turnoActivo ? { turnoId: turnoActivo.id } : {}),
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createTandaSchema),
    defaultValues: baseDefaults(),
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createTanda(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    idempotencyKeyRef.current = genKey();
    reset(baseDefaults());
    onCreated();
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      reset(baseDefaults());
      setServerError('');
    }
    onOpenChange(open);
  };

  const formErrors = errors as Record<string, { message?: string }>;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Receta */}
          <div className="space-y-1.5">
            <Label>{t('receta')} *</Label>
            <Select onValueChange={(v) => setValue('recetaId', v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder={t('recetaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  // Solo recetas de producción: la action createTanda rechaza tipo servicio
                  // (Principio Rector — el FEFO de servicio corre en la entrega del pedido).
                  const con = recetas.filter(
                    (r) => r.tipoReceta === 'produccion' && r.ingredientes.length > 0,
                  );
                  return con.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      {t('sinRecetas')}
                    </SelectItem>
                  ) : (
                    con.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({r.ingredientes.length} {t('ingShort')})
                        </span>
                      </SelectItem>
                    ))
                  );
                })()}
              </SelectContent>
            </Select>
            {formErrors.recetaId && (
              <p className="text-xs text-destructive">{formErrors.recetaId.message}</p>
            )}
          </div>

          {/* Cantidad de tandas */}
          <div className="space-y-1.5">
            <Label htmlFor="cantidadTandas">{t('cantidadTandas')} *</Label>
            <Input
              id="cantidadTandas"
              type="number"
              min="1"
              step="1"
              {...register('cantidadTandas', { valueAsNumber: true })}
            />
            {formErrors.cantidadTandas && (
              <p className="text-xs text-destructive">{formErrors.cantidadTandas.message}</p>
            )}
          </div>

          {/* Zona destino */}
          <div className="space-y-1.5">
            <Label>{t('zonaDestino')} *</Label>
            <Select
              onValueChange={(v) =>
                setValue('zonaDestino', v as 'amex' | 'snack' | 'buffet', {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('zonaDestinoPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amex">{t('zonaAmex')}</SelectItem>
                <SelectItem value="buffet">{t('zonaBuffet')}</SelectItem>
                <SelectItem value="snack">{t('zonaSnack')}</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.zonaDestino && (
              <p className="text-xs text-destructive">{t('zonaDestinoRequerida')}</p>
            )}
          </div>

          {/* Responsable (auto del usuario logueado) */}
          <div className="space-y-1.5">
            <Label>{t('responsable')}</Label>
            <div className="flex items-center px-3 py-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              {responsableNombre}
            </div>
            <p className="text-xs text-muted-foreground">{t('responsableHint')}</p>
          </div>

          {/* Turno activo */}
          <div className="space-y-1.5">
            <Label>{t('turno')}</Label>
            {turnoActivo ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border bg-muted/40 text-sm">
                <span>
                  {turnoActivo.bloque
                    ? `${turnoActivo.bloque} · ${formatBloqueHorario(turnoActivo.bloque)}`
                    : turnoActivo.nombre}
                </span>
                <span className="text-xs text-muted-foreground">{t('turnoActivo')}</span>
              </div>
            ) : (
              <div className="flex items-center px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/5 text-sm text-amber-700 dark:text-amber-300">
                {t('sinTurno')}
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notas">
              {t('notas')}{' '}
              <span className="text-muted-foreground font-normal">{t('optional')}</span>
            </Label>
            <textarea
              id="notas"
              rows={2}
              placeholder={t('notasPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              {...register('notas')}
            />
          </div>

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
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                recetas.filter((r) => r.tipoReceta === 'produccion' && r.ingredientes.length > 0)
                  .length === 0
              }
            >
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
