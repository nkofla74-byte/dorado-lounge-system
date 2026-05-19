'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createInsumo, createLote } from '@/modules/inventory/actions';
import { getProveedores } from '@/modules/proveedores/actions';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { UnidadMedida, CapaInventario } from '@dorado/shared-types';

const UNIDADES: UnidadMedida[] = ['kg', 'g', 'lb', 'l', 'ml', 'unidad', 'porcion'];

interface Props {
  insumos: InsumoWithStock[];
}

type Modo = 'existente' | 'nuevo';

export function NuevoIngresoDialog({ insumos }: Props) {
  const router = useRouter();
  const t = useTranslations('inventory.nuevoIngreso');
  const tUnidad = useTranslations('inventory.unidad');

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  const [modo, setModo] = useState<Modo>('existente');
  const [insumoId, setInsumoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaUnidad, setNuevaUnidad] = useState<UnidadMedida>('kg');
  const [nuevaCapa, setNuevaCapa] = useState<CapaInventario>('capa_1');
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState('0');

  const [proveedorId, setProveedorId] = useState('');
  const [cantidadEmpaques, setCantidadEmpaques] = useState('1');
  const [pesoUnitario, setPesoUnitario] = useState('');
  const [unidadPeso, setUnidadPeso] = useState<UnidadMedida>('kg');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');

  useEffect(() => {
    if (!open) return;
    void getProveedores().then((r) => {
      if (r.ok) setProveedores(r.value.filter((p) => p.activo));
    });
  }, [open]);

  function reset() {
    setModo('existente');
    setInsumoId('');
    setNuevoNombre('');
    setNuevaUnidad('kg');
    setNuevaCapa('capa_1');
    setNuevoStockMinimo('0');
    setProveedorId('');
    setCantidadEmpaques('1');
    setPesoUnitario('');
    setUnidadPeso('kg');
    setFechaVencimiento('');
    setCostoUnitario('');
    setError('');
  }

  const unidadLabel = (u: UnidadMedida) => (tUnidad.has(u) ? tUnidad(u) : u);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const empaques = Number(cantidadEmpaques);
    const peso = Number(pesoUnitario);
    if (!Number.isFinite(empaques) || empaques <= 0) {
      setError(t('errorEmpaques'));
      return;
    }
    if (!Number.isFinite(peso) || peso <= 0) {
      setError(t('errorPeso'));
      return;
    }

    startTransition(async () => {
      let targetInsumoId = insumoId;

      if (modo === 'nuevo') {
        if (!nuevoNombre.trim()) {
          setError(t('errorNombre'));
          return;
        }
        const insumoRes = await createInsumo({
          nombre: nuevoNombre.trim(),
          capa: nuevaCapa,
          unidadMedida: nuevaUnidad,
          stockMinimo: Number(nuevoStockMinimo) || 0,
        });
        if (!insumoRes.ok) {
          setError(insumoRes.error.message);
          return;
        }
        targetInsumoId = insumoRes.value.id;
      } else {
        if (!targetInsumoId) {
          setError(t('errorInsumo'));
          return;
        }
      }

      const cantidadInicial = empaques * peso;
      const loteRes = await createLote({
        insumoId: targetInsumoId,
        cantidadInicial,
        cantidadEmpaques: empaques,
        pesoUnitario: peso,
        unidadPeso,
        fechaVencimiento: fechaVencimiento || undefined,
        proveedorId: proveedorId || undefined,
        costoUnitario: costoUnitario ? Number(costoUnitario) : undefined,
      });

      if (!loteRes.ok) {
        setError(loteRes.error.message);
        return;
      }

      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PackagePlus className="h-4 w-4 mr-1.5" />
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Modo */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={modo === 'existente' ? 'default' : 'outline'}
              onClick={() => setModo('existente')}
            >
              {t('modoExistente')}
            </Button>
            <Button
              type="button"
              variant={modo === 'nuevo' ? 'default' : 'outline'}
              onClick={() => setModo('nuevo')}
            >
              {t('modoNuevo')}
            </Button>
          </div>

          {/* Insumo */}
          {modo === 'existente' ? (
            <div className="space-y-1.5">
              <Label htmlFor="insumo">{t('insumo')} *</Label>
              <Select value={insumoId} onValueChange={setInsumoId}>
                <SelectTrigger id="insumo">
                  <SelectValue placeholder={t('insumoPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {insumos.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.codigo} · {i.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3 border border-border rounded-md p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t('seccionNuevoInsumo')}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="nombre">{t('nombre')} *</Label>
                <Input
                  id="nombre"
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder={t('nombrePlaceholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="capa">{t('capa')} *</Label>
                  <Select
                    value={nuevaCapa}
                    onValueChange={(v) => setNuevaCapa(v as CapaInventario)}
                  >
                    <SelectTrigger id="capa">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capa_1">{t('capa1')}</SelectItem>
                      <SelectItem value="capa_2">{t('capa2')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unidadBase">{t('unidadBase')} *</Label>
                  <Select
                    value={nuevaUnidad}
                    onValueChange={(v) => setNuevaUnidad(v as UnidadMedida)}
                  >
                    <SelectTrigger id="unidadBase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map((u) => (
                        <SelectItem key={u} value={u}>
                          {unidadLabel(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stockMin">{t('stockMinimo')}</Label>
                <Input
                  id="stockMin"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={nuevoStockMinimo}
                  onChange={(e) => setNuevoStockMinimo(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('codigoAutoHint')}</p>
            </div>
          )}

          {/* Proveedor */}
          <div className="space-y-1.5">
            <Label htmlFor="proveedor">{t('proveedor')}</Label>
            <Select value={proveedorId} onValueChange={setProveedorId}>
              <SelectTrigger id="proveedor">
                <SelectValue placeholder={t('proveedorPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Empaques × peso */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="empaques">{t('cantidadEmpaques')} *</Label>
              <Input
                id="empaques"
                type="number"
                min="1"
                step="1"
                value={cantidadEmpaques}
                onChange={(e) => setCantidadEmpaques(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="peso">{t('pesoUnitario')} *</Label>
              <Input
                id="peso"
                type="number"
                min="0"
                step="0.0001"
                value={pesoUnitario}
                onChange={(e) => setPesoUnitario(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unidad">{t('unidad')} *</Label>
              <Select value={unidadPeso} onValueChange={(v) => setUnidadPeso(v as UnidadMedida)}>
                <SelectTrigger id="unidad">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unidadLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha vencimiento + costo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vence">{t('fechaVencimiento')}</Label>
              <Input
                id="vence"
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="costo">{t('costoUnitario')}</Label>
              <Input
                id="costo"
                type="number"
                min="0"
                step="0.01"
                value={costoUnitario}
                onChange={(e) => setCostoUnitario(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancelar')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {t('guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
