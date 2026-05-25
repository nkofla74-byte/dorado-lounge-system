'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { UserPlus, Plane, Loader2, ScanLine } from 'lucide-react';
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
import { useDocumentScanner, type ScanResult } from '@/lib/scanner/use-document-scanner';

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
type Sexo = 'M' | 'F' | 'X' | '';

function calcularEdad(fechaISO: string): number | null {
  const dob = new Date(fechaISO);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

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
  const [sexo, setSexo] = useState<Sexo>('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [paisOrigen, setPaisOrigen] = useState('');
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
    setSexo('');
    setFechaNacimiento('');
    setPaisOrigen('');
    setNotas('');
  };

  const handleScan = useCallback(
    (result: ScanResult) => {
      if (result.type === 'unknown') {
        toast.warning(t('escaneoNoReconocido'));
        return;
      }

      if (result.nombrePasajero) setNombre(result.nombrePasajero);

      if (result.type === 'bcbp') {
        if (result.destino) setDestino(result.destino);
        if (result.aerolinea) setAerolinea(result.aerolinea);
        if (result.vueloNumero) setVuelo(result.vueloNumero);
        if (result.asiento) setAsiento(result.asiento);
        toast.success(t('escaneoExitoso', { tipo: t('tipoBcbp') }));
      } else {
        // mrz or cedula_co
        if (result.documentoTipo) setDocTipo(result.documentoTipo);
        if (result.documentoNumero) setDocNumero(result.documentoNumero);
        if (result.sexo) setSexo(result.sexo);
        if (result.fechaNacimiento) setFechaNacimiento(result.fechaNacimiento);
        if (result.paisOrigen) setPaisOrigen(result.paisOrigen);
        const tipoKey = result.type === 'mrz' ? 'tipoMrz' : 'tipoCedulaCo';
        toast.success(t('escaneoExitoso', { tipo: t(tipoKey) }));
      }
    },
    [t],
  );

  const { inputRef, handleKeyDown } = useDocumentScanner(handleScan);

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
        sexo: (sexo || undefined) as 'M' | 'F' | 'X' | undefined,
        fechaNacimiento: fechaNacimiento || undefined,
        paisOrigen: paisOrigen.trim().toUpperCase() || undefined,
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

  const edad = fechaNacimiento ? calcularEdad(fechaNacimiento) : null;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{t('title')}</h3>
      </div>

      {/* Zona de escaneo */}
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        <ScanLine className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground mb-0.5">{t('scanTip')}</p>
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/40 text-foreground"
            placeholder={t('scanAreaPlaceholder')}
            onKeyDown={handleKeyDown}
            aria-label={t('scanearDoc')}
            autoComplete="off"
          />
        </div>
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

      {/* Fila 2: Demografía */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>{t('sexo')}</Label>
          <Select value={sexo} onValueChange={(v) => setSexo(v as Sexo)}>
            <SelectTrigger>
              <SelectValue placeholder={t('sexoPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">{t('sexoM')}</SelectItem>
              <SelectItem value="F">{t('sexoF')}</SelectItem>
              <SelectItem value="X">{t('sexoX')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-fnac">
            {t('fechaNacimiento')}
            {edad !== null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({edad} {t('anos')})
              </span>
            )}
          </Label>
          <Input
            id="pax-fnac"
            type="date"
            value={fechaNacimiento}
            onChange={(e) => setFechaNacimiento(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pax-pais">{t('paisOrigen')}</Label>
          <Input
            id="pax-pais"
            placeholder="COL"
            maxLength={3}
            className="uppercase"
            value={paisOrigen}
            onChange={(e) => setPaisOrigen(e.target.value.toUpperCase())}
          />
        </div>
      </div>

      {/* Fila 3: Vuelo */}
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

      {/* Fila 4: Acceso + Zona */}
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
