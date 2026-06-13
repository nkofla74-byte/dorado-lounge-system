'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createRequisicion } from '@/modules/requisiciones/actions';
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
import type { AreaSolicitante } from '@/modules/requisiciones/domain/requisicion';

export interface InsumoOption {
  id: string;
  nombre: string;
  unidadMedida: 'g' | 'ml' | 'unidad';
}

interface PedirInsumosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  area: AreaSolicitante;
  insumos: InsumoOption[];
}

interface Row {
  insumoId: string;
  cantidad: string;
}

const genKey = () => `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function PedirInsumosDialog({
  open,
  onOpenChange,
  onCreated,
  area,
  insumos,
}: PedirInsumosDialogProps) {
  const t = useTranslations('requisiciones.pedir');
  const [rows, setRows] = useState<Row[]>([{ insumoId: '', cantidad: '' }]);
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef(genKey());

  const reset = () => {
    setRows([{ insumoId: '', cantidad: '' }]);
    setServerError('');
    idempotencyKeyRef.current = genKey();
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const onSubmit = async () => {
    const items = rows
      .filter((r) => r.insumoId && Number(r.cantidad) > 0)
      .map((r) => {
        const insumo = insumos.find((i) => i.id === r.insumoId)!;
        return {
          insumoId: r.insumoId,
          cantidadSolicitada: Number(r.cantidad),
          unidad: insumo.unidadMedida,
        };
      });

    if (items.length === 0) {
      setServerError(t('errorSinItems'));
      return;
    }

    setSubmitting(true);
    setServerError('');
    const result = await createRequisicion({
      areaSolicitante: area,
      idempotencyKey: idempotencyKeyRef.current,
      items,
    });
    setSubmitting(false);

    if (result.ok) {
      reset();
      onCreated();
    } else {
      setServerError(result.error.message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('titulo')}</DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('insumo')}</Label>
                <Select value={row.insumoId} onValueChange={(v) => updateRow(i, { insumoId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('seleccioneInsumo')} />
                  </SelectTrigger>
                  <SelectContent>
                    {insumos.map((insumo) => (
                      <SelectItem key={insumo.id} value={insumo.id}>
                        {insumo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label className="text-xs">{t('cantidad')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={row.cantidad}
                  onChange={(e) => updateRow(i, { cantidad: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={rows.length === 1}
                aria-label={t('quitar')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { insumoId: '', cantidad: '' }])}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('agregarInsumo')}
          </Button>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancelar')}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('enviar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
