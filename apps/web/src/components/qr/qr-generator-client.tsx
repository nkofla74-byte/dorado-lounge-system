'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { Printer, Download, QrCode, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateQRLink } from '@/app/(dashboard)/admin/qr/actions';
import { toast } from 'sonner';

// QR público solo para zona AMEX (Snack y Buffet no usan menú digital de pasajero).
const ZONA: 'amex' = 'amex';
type ZonaKey = typeof ZONA;

const LOCALES = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
  { value: 'pt', label: 'PT' },
] as const;

interface QRResult {
  url: string;
  mesaNumero: string;
  zona: ZonaKey;
  zonaLabel: string;
  dataUrl: string;
}

const ESTILOS_IMPRESION = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #fff; }
  .card {
    width: 240px; margin: 20px auto; padding: 20px;
    border: 2px solid #000; border-radius: 12px;
    text-align: center;
  }
  .lounge { font-size: 11px; font-weight: 700; letter-spacing: 0.15em;
    text-transform: uppercase; color: #555; margin-bottom: 6px; }
  .mesa { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
  .zona { font-size: 12px; color: #666; margin-bottom: 12px; }
  img { width: 180px; height: 180px; }
  .instruccion { font-size: 10px; color: #888; margin-top: 10px; line-height: 1.4; }
`;

export function QRGeneratorClient() {
  const t = useTranslations('qrAdmin');
  const [mesaNumero, setMesaNumero] = useState('');
  const locale = 'es';
  const [result, setResult] = useState<QRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const zonaLabel = t('zonaAmex');

  const handleGenerate = async () => {
    if (!mesaNumero.trim()) return;
    setLoading(true);
    const res = await generateQRLink({ mesaNumero: mesaNumero.trim(), zona: ZONA, locale });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }

    const dataUrl = await QRCode.toDataURL(res.value.url, {
      width: 400,
      margin: 2,
      // Negro y blanco literales, a propósito: el contraste de un código QR
      // determina si el lector del móvil lo reconoce. No es un color de marca
      // y no debe seguir al tema.
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    setResult({
      url: res.value.url,
      mesaNumero: mesaNumero.trim(),
      zona: ZONA,
      zonaLabel,
      dataUrl,
    });
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.dataUrl;
    a.download = `qr-${result.zona}-${result.mesaNumero.replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;

    // Se construye el documento con la API del DOM en lugar de document.write con
    // plantillas interpoladas: el número de mesa viene de un campo de formulario
    // y la ventana comparte origen con la aplicación (F-031).
    const doc = win.document;
    doc.title = `QR ${result?.zonaLabel ?? ''} — ${result?.mesaNumero ?? ''}`;

    const estilos = doc.createElement('style');
    estilos.textContent = ESTILOS_IMPRESION;
    doc.head.appendChild(estilos);

    doc.body.appendChild(printRef.current.cloneNode(true));

    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="space-y-5">
      {/* Formulario */}
      <div className="space-y-3 border border-border rounded-xl p-4 bg-card">
        <div className="space-y-1.5">
          <Label htmlFor="mesa">{t('mesaLabel')}</Label>
          <Input
            id="mesa"
            placeholder={t('mesaPlaceholder')}
            value={mesaNumero}
            onChange={(e) => setMesaNumero(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('zonaLabel')}</Label>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-sm text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {zonaLabel}
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleGenerate}
          disabled={loading || !mesaNumero.trim()}
        >
          <QrCode className="h-4 w-4 mr-2" />
          {loading ? t('generando') : t('generar')}
        </Button>
      </div>

      {/* Resultado — tarjeta imprimible */}
      {result && (
        <div className="space-y-3">
          {/* Vista previa */}
          <div className="flex justify-center">
            <div
              ref={printRef}
              className="w-56 border-2 border-foreground rounded-xl p-5 text-center bg-white text-black"
            >
              <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">
                Dorado Lounge
              </p>
              <p className="text-xl font-extrabold mb-0.5">{result.mesaNumero}</p>
              <p className="text-caption text-muted-foreground mb-3">{result.zonaLabel}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.dataUrl}
                alt={`QR ${result.mesaNumero}`}
                className="w-44 h-44 mx-auto"
              />
              <p className="text-[9px] text-muted-foreground mt-3 leading-snug">
                {t('scanInstrucciones')}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              {t('imprimir')}
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              {t('descargar')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setResult(null)}
              title={t('nuevoQrTitle')}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* URL generada (diagnóstico) */}
          <div className="rounded-md border border-dashed border-border p-2.5 bg-muted/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t('urlLabel')}
            </p>
            <p className="text-[11px] font-mono break-all text-foreground/80 leading-relaxed">
              {result.url}
            </p>
            {!result.url.startsWith('http') && (
              <p className="text-[11px] text-destructive mt-1.5">
                ⚠{' '}
                {t.rich('urlRelativaWarn', {
                  var: () => <code>NEXT_PUBLIC_APP_URL</code>,
                })}
              </p>
            )}
          </div>

          <p className="text-caption text-muted-foreground text-center">{t('tokenInfo')}</p>
        </div>
      )}
    </div>
  );
}
