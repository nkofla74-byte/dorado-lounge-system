'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plane } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registrarIngreso } from '@/modules/afluencia/actions';

type Zona = 'amex' | null;

interface Props {
  turnoId: string;
  onSuccess: () => void;
}

export function RegistrarIngresoDialog({ turnoId, onSuccess }: Props) {
  const t = useTranslations('afluencia');
  const [cantidad, setCantidad] = useState(1);
  const [zona, setZona] = useState<Zona>(null);
  const [vuelo, setVuelo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (cantidad < 1) return;
    setLoading(true);
    try {
      const result = await registrarIngreso({
        turnoId,
        cantidad,
        zona: zona ?? undefined,
        vueloNumero: vuelo.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(t('registradoToast', { n: cantidad }));
      setCantidad(1);
      setVuelo('');
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t('registrarTitle')}</h3>

      <div className="flex flex-wrap items-end gap-3">
        {/* Cantidad */}
        <div className="space-y-1">
          <label htmlFor="af-cantidad" className="text-xs text-muted-foreground font-medium">
            {t('cantidad')}
          </label>
          <Input
            id="af-cantidad"
            type="number"
            min={1}
            className="w-20 tabular-nums"
            value={cantidad}
            onChange={(e) => setCantidad(parseInt(e.target.value, 10) || 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) void handleSubmit();
            }}
          />
        </div>

        {/* Zona toggle */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground font-medium block">{t('zona')}</span>
          <div className="flex rounded-md border border-input overflow-hidden h-9">
            <button
              type="button"
              onClick={() => setZona(null)}
              className={`px-3 text-sm font-medium transition-colors ${
                zona === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('zonaSala')}
            </button>
            <button
              type="button"
              onClick={() => setZona('amex')}
              className={`px-3 text-sm font-medium border-l border-input transition-colors ${
                zona === 'amex'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('zonaAmex')}
            </button>
          </div>
        </div>

        {/* Vuelo */}
        <div className="space-y-1">
          <label
            htmlFor="af-vuelo"
            className="text-xs text-muted-foreground font-medium flex items-center gap-1"
          >
            <Plane className="h-3 w-3" />
            {t('vuelo')}
          </label>
          <Input
            id="af-vuelo"
            className="w-28"
            placeholder={t('vueloPlaceholder')}
            maxLength={10}
            value={vuelo}
            onChange={(e) => setVuelo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) void handleSubmit();
            }}
          />
        </div>

        {/* Submit */}
        <Button onClick={handleSubmit} disabled={loading || cantidad < 1} className="h-9">
          {loading ? t('submitting') : t('submit')}
        </Button>
      </div>
    </div>
  );
}
