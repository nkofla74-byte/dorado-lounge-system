'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { UserPlus, Plane, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { registrarPasajero } from '@/modules/afluencia/actions';
import { TIPOS_ACCESO, type TipoAcceso } from '@/modules/afluencia/domain/pasajero-ingreso';

interface Props {
  turnoId: string;
  onSuccess: () => void;
}

const TIPO_ACCESO_LABELS: Record<TipoAcceso, string> = {
  amex: 'AMEX',
  priority_pass: 'Priority Pass',
  diners: 'Diners Club',
  cortesia: 'Cortesía',
  corporativo: 'Corporativo',
  otro: 'Otro',
};

type Zona = 'amex' | null;

export function RegistrarPasajeroForm({ turnoId, onSuccess }: Props) {
  const t = useTranslations('afluencia.pasajero');
  const [loading, setLoading] = useState(false);

  const [nombre, setNombre] = useState('');
  const [docTipo, setDocTipo] = useState('');
  const [docNumero, setDocNumero] = useState('');
  const [vuelo, setVuelo] = useState('');
  const [aerolinea, setAerolinea] = useState('');
  const [destino, setDestino] = useState('');
  const [horaVuelo, setHoraVuelo] = useState('');
  const [asiento, setAsiento] = useState('');
  const [gate, setGate] = useState('');
  const [tipoAcceso, setTipoAcceso] = useState<TipoAcceso>('amex');
  const [ultimos4, setUltimos4] = useState('');
  const [acompanantes, setAcompanantes] = useState(0);
  const [zona, setZona] = useState<Zona>(null);
  const [notas, setNotas] = useState('');

  const resetForm = () => {
    setNombre('');
    setDocTipo('');
    setDocNumero('');
    setVuelo('');
    setAerolinea('');
    setDestino('');
    setHoraVuelo('');
    setAsiento('');
    setGate('');
    setTipoAcceso('amex');
    setUltimos4('');
    setAcompanantes(0);
    setZona(null);
    setNotas('');
  };

  const handleSubmit = async () => {
    if (!nombre.trim()) {
      toast.error(t('nombreRequerido'));
      return;
    }
    setLoading(true);
    try {
      const result = await registrarPasajero({
        turnoId,
        nombrePasajero: nombre.trim(),
        documentoTipo: docTipo.trim() || undefined,
        documentoNumero: docNumero.trim() || undefined,
        vueloNumero: vuelo.trim() || undefined,
        aerolinea: aerolinea.trim() || undefined,
        destino: destino.trim().toUpperCase() || undefined,
        horaVuelo: horaVuelo || undefined,
        asiento: asiento.trim().toUpperCase() || undefined,
        gate: gate.trim().toUpperCase() || undefined,
        tipoAcceso,
        tarjetaUltimos4: ultimos4.trim() || undefined,
        acompanantes,
        zona: zona ?? undefined,
        notas: notas.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const total = 1 + acompanantes;
      toast.success(t('registrado', { n: total }));
      resetForm();
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      {/* Fila 1: Nombre + Documento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1 space-y-1">
          <Label htmlFor="pax-nombre">{t('nombre')} *</Label>
          <Input
            id="pax-nombre"
            placeholder={t('nombrePlaceholder')}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-doc-tipo">{t('docTipo')}</Label>
          <Select value={docTipo} onValueChange={setDocTipo}>
            <SelectTrigger id="pax-doc-tipo">
              <SelectValue placeholder={t('docTipoPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CC">CC</SelectItem>
              <SelectItem value="CE">CE</SelectItem>
              <SelectItem value="pasaporte">Pasaporte</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-doc-num">{t('docNumero')}</Label>
          <Input
            id="pax-doc-num"
            placeholder={t('docNumeroPlaceholder')}
            value={docNumero}
            onChange={(e) => setDocNumero(e.target.value)}
          />
        </div>
      </div>

      {/* Fila 2: Vuelo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label htmlFor="pax-vuelo" className="flex items-center gap-1">
            <Plane className="h-3 w-3" /> {t('vuelo')}
          </Label>
          <Input
            id="pax-vuelo"
            placeholder="AV123"
            maxLength={10}
            value={vuelo}
            onChange={(e) => setVuelo(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-aerolinea">{t('aerolinea')}</Label>
          <Input
            id="pax-aerolinea"
            placeholder="Avianca"
            value={aerolinea}
            onChange={(e) => setAerolinea(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-destino">{t('destino')}</Label>
          <Input
            id="pax-destino"
            placeholder="MIA"
            maxLength={3}
            className="uppercase"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-hora">{t('horaVuelo')}</Label>
          <Input
            id="pax-hora"
            type="time"
            value={horaVuelo}
            onChange={(e) => setHoraVuelo(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="pax-asiento">{t('asiento')}</Label>
            <Input
              id="pax-asiento"
              placeholder="12A"
              maxLength={4}
              className="uppercase"
              value={asiento}
              onChange={(e) => setAsiento(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="pax-gate">Gate</Label>
            <Input
              id="pax-gate"
              placeholder="C2"
              maxLength={5}
              className="uppercase"
              value={gate}
              onChange={(e) => setGate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Fila 3: Acceso + Zona */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="space-y-1">
          <Label>{t('tipoAcceso')} *</Label>
          <Select value={tipoAcceso} onValueChange={(v) => setTipoAcceso(v as TipoAcceso)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_ACCESO.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {TIPO_ACCESO_LABELS[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-tarjeta">{t('ultimos4')}</Label>
          <Input
            id="pax-tarjeta"
            placeholder="1234"
            maxLength={4}
            value={ultimos4}
            onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-acomp">{t('acompanantes')}</Label>
          <Input
            id="pax-acomp"
            type="number"
            min={0}
            max={10}
            className="w-20"
            value={acompanantes}
            onChange={(e) => setAcompanantes(parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('zona')}</Label>
          <div className="flex rounded-md border border-input overflow-hidden h-9">
            <button
              type="button"
              onClick={() => setZona(null)}
              className={cn(
                'px-3 text-sm font-medium transition-colors flex-1',
                zona === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {t('zonaSala')}
            </button>
            <button
              type="button"
              onClick={() => setZona('amex')}
              className={cn(
                'px-3 text-sm font-medium border-l border-input transition-colors flex-1',
                zona === 'amex'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              AMEX
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-notas">{t('notas')}</Label>
          <Input
            id="pax-notas"
            placeholder={t('notasPlaceholder')}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={loading || !nombre.trim()}
          className="min-w-[160px]"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <UserPlus className="h-4 w-4 mr-2" />
          )}
          {loading ? t('registrando') : t('registrar')}
        </Button>
      </div>
    </div>
  );
}
