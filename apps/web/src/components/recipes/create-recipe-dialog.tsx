'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, X } from 'lucide-react';
import { createRecetaSchema } from '@dorado/shared-validation';
import { createReceta } from '@/modules/recipes/actions';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { unidadesCompatibles } from '@/lib/units';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { CategoriaMenu, UnidadMedida } from '@dorado/shared-types';
import type { z } from 'zod';

type FormInput = z.input<typeof createRecetaSchema>;
type FormOutput = z.output<typeof createRecetaSchema>;

interface CreateRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  insumos: InsumoWithStock[];
  insumosCapa2: InsumoWithStock[];
}

type ZonaKey = 'amex' | 'snack' | 'buffet';
const ZONAS: ZonaKey[] = ['amex', 'snack', 'buffet'];
const CATEGORIAS: CategoriaMenu[] = ['entrada', 'plato_fuerte', 'acompanante', 'postre'];

export function CreateRecipeDialog({
  open,
  onOpenChange,
  onCreated,
  insumos,
  insumosCapa2,
}: CreateRecipeDialogProps) {
  const t = useTranslations('recipes.create');
  const tZ = useTranslations('zonas');
  const tIng = useTranslations('ingredientes');
  const [serverError, setServerError] = useState('');
  const [tipoReceta, setTipoReceta] = useState<'produccion' | 'servicio' | ''>('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createRecetaSchema),
    defaultValues: { ingredientes: [] } as Partial<FormInput>,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'ingredientes' as never });
  // Mira los ingredientes para: (a) mostrar la unidad del insumo como sufijo,
  // (b) calcular cantidad bruta en vivo, (c) mostrar merma como porcentaje.
  const watchedIngredientes = useWatch({ control, name: 'ingredientes' as never }) as
    | Array<{
        insumoId?: string;
        cantidad?: number;
        unidad?: UnidadMedida;
        mermaCoeficiente?: number;
      }>
    | undefined;

  const categoriaLabels: Record<CategoriaMenu, string> = {
    entrada: tIng('categoriaEntrada'),
    plato_fuerte: tIng('categoriaPlatoFuerte'),
    acompanante: tIng('categoriaAcompanante'),
    postre: tIng('categoriaPostre'),
  };

  // Insumos disponibles para ingredientes: capa_1 (materias primas) siempre;
  // capa_2 también si la receta es de servicio (puede usar productos intermedios).
  const insumosParaIngredientes =
    tipoReceta === 'servicio' ? insumos : insumos.filter((i) => i.capa === 'capa_1');

  // La unidad del rendimiento la manda el insumo destino, no un campo aparte.
  const destinoId = watch('insumoDestinoId' as keyof FormInput) as string | undefined;
  const unidadDestino = insumosCapa2.find((i) => i.id === destinoId)?.unidadMedida;

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createReceta(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    resetForm();
    onCreated();
  };

  const resetForm = () => {
    reset({ ingredientes: [] } as Partial<FormInput>);
    setTipoReceta('');
  };

  const handleClose = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleAddIngrediente = () => {
    append({ insumoId: '', cantidad: 0, mermaCoeficiente: 0, unidad: undefined } as never);
  };

  const formErrors = errors as Record<string, { message?: string }>;
  const ingredientesError = (
    errors as { ingredientes?: { message?: string; root?: { message?: string } } }
  ).ingredientes;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-1">
          {/* ── Datos generales ──────────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              {t('seccionGeneral')}
            </h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nombre">{t('nombre')} *</Label>
                <Input
                  id="nombre"
                  {...register('nombre')}
                  placeholder={t('nombrePlaceholder')}
                  autoFocus
                />
                {formErrors.nombre && (
                  <p className="text-caption text-destructive">{formErrors.nombre.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{t('tipo')} *</Label>
                <Select
                  onValueChange={(v: 'produccion' | 'servicio') => {
                    setTipoReceta(v);
                    setValue('tipoReceta', v, { shouldValidate: true });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('tipoPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="produccion">{t('tipoProduccionLabel')}</SelectItem>
                    <SelectItem value="servicio">{t('tipoServicioLabel')}</SelectItem>
                  </SelectContent>
                </Select>
                {formErrors.tipoReceta && (
                  <p className="text-caption text-destructive">{formErrors.tipoReceta.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="porciones">{t('porciones')} *</Label>
                <Input
                  id="porciones"
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t('porcionesPlaceholder')}
                  {...register('porciones', { valueAsNumber: true })}
                />
                {formErrors.porciones && (
                  <p className="text-caption text-destructive">{formErrors.porciones.message}</p>
                )}
              </div>

              {tipoReceta === 'produccion' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t('insumoDestino')} *</Label>
                  <Select
                    onValueChange={(v) =>
                      setValue('insumoDestinoId' as keyof FormInput, v as never, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('insumoPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {insumosCapa2.length === 0 ? (
                        <SelectItem value="_empty" disabled>
                          {t('sinInsumosCapa2')}
                        </SelectItem>
                      ) : (
                        insumosCapa2.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.nombre}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {formErrors.insumoDestinoId && (
                    <p className="text-caption text-destructive">
                      {formErrors.insumoDestinoId.message}
                    </p>
                  )}
                </div>
              )}

              {/* Rendimiento por tanda (F-037).
                  Sin este dato, completar la tanda descontaba los ingredientes y
                  no creaba el producto elaborado: los amasijos y postres no
                  existían como stock. La unidad la manda el insumo destino, así
                  que se muestra en vez de pedirla: dos fuentes de verdad para la
                  misma unidad acabarían contradiciéndose. */}
              {tipoReceta === 'produccion' && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="rendimientoCantidad">
                    {t('rendimiento')} *
                    {unidadDestino && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({unidadDestino})
                      </span>
                    )}
                  </Label>
                  <Input
                    id="rendimientoCantidad"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    placeholder={t('rendimientoPlaceholder')}
                    {...register('rendimientoCantidad' as keyof FormInput, { valueAsNumber: true })}
                  />
                  <p className="text-caption text-muted-foreground">{t('rendimientoAyuda')}</p>
                  {formErrors.rendimientoCantidad && (
                    <p className="text-caption text-destructive">
                      {formErrors.rendimientoCantidad.message}
                    </p>
                  )}
                </div>
              )}

              {tipoReceta === 'servicio' && (
                <>
                  <div className="space-y-1.5">
                    <Label>{t('zona')} *</Label>
                    <Select
                      onValueChange={(v) =>
                        setValue('zona' as keyof FormInput, v as never, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('zonaPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {ZONAS.map((z) => (
                          <SelectItem key={z} value={z}>
                            {tZ(z)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formErrors.zona && (
                      <p className="text-caption text-destructive">{formErrors.zona.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t('categoria')}</Label>
                    <Select
                      onValueChange={(v) =>
                        setValue('categoriaMenu' as keyof FormInput, v as never, {
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('categoriaPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {categoriaLabels[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="descripcion">{t('descripcion')}</Label>
                <Textarea
                  id="descripcion"
                  rows={2}
                  placeholder={t('descripcionPlaceholder')}
                  {...register('descripcion')}
                />
              </div>
            </div>
          </section>

          {/* ── Ingredientes ─────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                {t('seccionIngredientes')}
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddIngrediente}
                disabled={!tipoReceta}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('agregarIngrediente')}
              </Button>
            </div>

            {!tipoReceta ? (
              <p className="text-caption text-muted-foreground italic">{t('elegiTipoPrimero')}</p>
            ) : fields.length === 0 ? (
              <p className="text-caption text-muted-foreground italic">{t('sinIngredientes')}</p>
            ) : (
              <div className="space-y-2">
                {fields.map((field, idx) => {
                  const errs = (
                    errors as {
                      ingredientes?: Array<{
                        insumoId?: { message?: string };
                        cantidad?: { message?: string };
                        mermaCoeficiente?: { message?: string };
                      }>;
                    }
                  ).ingredientes?.[idx];
                  const insumoIdSeleccionado = watchedIngredientes?.[idx]?.insumoId;
                  const insumoSel = insumoIdSeleccionado
                    ? insumosParaIngredientes.find((i) => i.id === insumoIdSeleccionado)
                    : undefined;
                  const unidadBase = (insumoSel?.unidadMedida as UnidadMedida | undefined) ?? null;
                  const unidadElegida =
                    (watchedIngredientes?.[idx]?.unidad as UnidadMedida | undefined) ??
                    unidadBase ??
                    null;
                  const opcionesUnidad = unidadBase ? unidadesCompatibles(unidadBase) : [];
                  const cantidad = watchedIngredientes?.[idx]?.cantidad ?? 0;
                  const coef = watchedIngredientes?.[idx]?.mermaCoeficiente ?? 0;
                  const mermaPctValue =
                    coef > 0 ? (coef * 100).toFixed(2).replace(/\.?0+$/, '') : '';
                  const cantidadBruta =
                    cantidad > 0 && coef >= 0 && coef < 1 ? cantidad / (1 - coef) : 0;
                  return (
                    <div key={field.id} className="space-y-1">
                      <div className="grid grid-cols-[1fr_110px_80px_85px_auto] gap-2 items-start">
                        <div>
                          <Select
                            onValueChange={(v) => {
                              setValue(`ingredientes.${idx}.insumoId` as never, v as never, {
                                shouldValidate: true,
                              });
                              const ins = insumosParaIngredientes.find((i) => i.id === v);
                              if (ins) {
                                setValue(
                                  `ingredientes.${idx}.mermaCoeficiente` as never,
                                  ins.mermaDefault as never,
                                  { shouldValidate: true },
                                );
                                // Reset unidad para que tome la del insumo por default.
                                setValue(
                                  `ingredientes.${idx}.unidad` as never,
                                  ins.unidadMedida as never,
                                  { shouldValidate: true },
                                );
                              }
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={t('insumoIngredientePlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {insumosParaIngredientes.length === 0 ? (
                                <SelectItem value="_empty" disabled>
                                  {t('sinInsumosDisponibles')}
                                </SelectItem>
                              ) : (
                                insumosParaIngredientes.map((i) => (
                                  <SelectItem key={i.id} value={i.id}>
                                    {i.nombre} ({i.unidadMedida})
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          {errs?.insumoId?.message && (
                            <p className="text-caption text-destructive mt-1">
                              {errs.insumoId.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            placeholder={t('cantidadPlaceholder')}
                            className="h-9 tabular-nums"
                            {...register(`ingredientes.${idx}.cantidad` as never, {
                              valueAsNumber: true,
                            })}
                          />
                          {errs?.cantidad?.message && (
                            <p className="text-caption text-destructive mt-1">
                              {errs.cantidad.message}
                            </p>
                          )}
                        </div>
                        <div>
                          <Select
                            {...(unidadElegida ? { value: unidadElegida } : {})}
                            onValueChange={(v) =>
                              setValue(`ingredientes.${idx}.unidad` as never, v as never, {
                                shouldValidate: true,
                              })
                            }
                            disabled={!unidadBase}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={t('unidadPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {opcionesUnidad.map((u) => (
                                <SelectItem key={u} value={u}>
                                  {u}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="99.99"
                              placeholder={t('mermaPlaceholder')}
                              className="h-9 pr-6"
                              value={mermaPctValue}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                if (e.target.value === '' || !Number.isFinite(num)) {
                                  setValue(
                                    `ingredientes.${idx}.mermaCoeficiente` as never,
                                    0 as never,
                                    { shouldValidate: true },
                                  );
                                  return;
                                }
                                if (num >= 0 && num < 100) {
                                  setValue(
                                    `ingredientes.${idx}.mermaCoeficiente` as never,
                                    (num / 100) as never,
                                    { shouldValidate: true },
                                  );
                                }
                              }}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-muted-foreground pointer-events-none">
                              %
                            </span>
                          </div>
                          {errs?.mermaCoeficiente?.message && (
                            <p className="text-caption text-destructive mt-1">
                              {errs.mermaCoeficiente.message}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => remove(idx)}
                          aria-label={t('quitarIngrediente')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {cantidadBruta > 0 && coef > 0 && unidadElegida && (
                        <p className="text-[11px] text-muted-foreground px-1 tabular-nums">
                          {t('cantidadBruta', {
                            value: cantidadBruta.toFixed(2),
                            unidad: unidadElegida,
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
                <div className="grid grid-cols-[1fr_110px_80px_85px_auto] gap-2 px-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <span>{t('colInsumo')}</span>
                  <span>{t('colCantidad')}</span>
                  <span>{t('colUnidad')}</span>
                  <span>{t('colMerma')}</span>
                  <span />
                </div>
              </div>
            )}
            {ingredientesError?.message && (
              <p className="text-caption text-destructive">{ingredientesError.message}</p>
            )}
          </section>

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
            <Button type="submit" disabled={isSubmitting || tipoReceta === ''}>
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
