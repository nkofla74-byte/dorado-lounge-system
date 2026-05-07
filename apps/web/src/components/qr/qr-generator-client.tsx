'use client';

import { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, QrCode, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateQRLink } from '@/app/(dashboard)/admin/qr/actions';
import { toast } from 'sonner';

const ZONAS = [
  { value: 'amex', label: 'Amex' },
  { value: 'snack', label: 'Snack Bar' },
  { value: 'buffet', label: 'Buffet' },
] as const;

const LOCALES = [
  { value: 'es', label: 'ES' },
  { value: 'en', label: 'EN' },
  { value: 'fr', label: 'FR' },
  { value: 'pt', label: 'PT' },
] as const;

interface QRResult {
  url: string;
  mesaNumero: string;
  zona: string;
  zonaLabel: string;
  dataUrl: string;
}

export function QRGeneratorClient() {
  const [mesaNumero, setMesaNumero] = useState('');
  const [zona, setZona] = useState<'amex' | 'snack' | 'buffet'>('amex');
  const [locale, setLocale] = useState('es');
  const [result, setResult] = useState<QRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!mesaNumero.trim()) return;
    setLoading(true);
    const res = await generateQRLink({ mesaNumero: mesaNumero.trim(), zona, locale });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }

    const dataUrl = await QRCode.toDataURL(res.value.url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    const zonaLabel = ZONAS.find((z) => z.value === zona)?.label ?? zona;
    setResult({ url: res.value.url, mesaNumero: mesaNumero.trim(), zona, zonaLabel, dataUrl });
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
    const html = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>QR ${result?.zonaLabel} — ${result?.mesaNumero}</title>
          <style>
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
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="space-y-5">
      {/* Formulario */}
      <div className="space-y-3 border border-border rounded-xl p-4 bg-card">
        <div className="space-y-1.5">
          <Label htmlFor="mesa">Número / nombre de mesa</Label>
          <Input
            id="mesa"
            placeholder="Ej: Mesa 5, VIP-3, Puerta 23"
            value={mesaNumero}
            onChange={(e) => setMesaNumero(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Zona</Label>
          <div className="flex gap-2">
            {ZONAS.map((z) => (
              <button
                key={z.value}
                onClick={() => setZona(z.value)}
                className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                  zona === z.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Idioma del pasajero</Label>
          <div className="flex gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  locale === l.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleGenerate}
          disabled={loading || !mesaNumero.trim()}
        >
          <QrCode className="h-4 w-4 mr-2" />
          {loading ? 'Generando…' : 'Generar QR'}
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
              <p className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                Dorado Lounge
              </p>
              <p className="text-xl font-extrabold mb-0.5">{result.mesaNumero}</p>
              <p className="text-xs text-gray-500 mb-3">{result.zonaLabel}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.dataUrl}
                alt={`QR ${result.mesaNumero}`}
                className="w-44 h-44 mx-auto"
              />
              <p className="text-[9px] text-gray-400 mt-3 leading-snug">
                Escanea para ordenar · Scan to order
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Descargar PNG
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setResult(null)} title="Nuevo QR">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* URL generada (diagnóstico) */}
          <div className="rounded-md border border-dashed border-border p-2.5 bg-muted/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              URL del QR
            </p>
            <p className="text-[11px] font-mono break-all text-foreground/80 leading-relaxed">
              {result.url}
            </p>
            {!result.url.startsWith('http') && (
              <p className="text-[11px] text-destructive mt-1.5">
                ⚠ URL relativa detectada — el QR no funcionará al escanearse. Configura{' '}
                <code>NEXT_PUBLIC_APP_URL</code> en Vercel.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Token válido por 4 horas · Genera uno nuevo cuando sea necesario
          </p>
        </div>
      )}
    </div>
  );
}
