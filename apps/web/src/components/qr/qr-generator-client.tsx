'use client';

import { useState } from 'react';
import { Copy, Check, Link2 } from 'lucide-react';
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
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
] as const;

export function QRGeneratorClient() {
  const [mesaNumero, setMesaNumero] = useState('');
  const [zona, setZona] = useState<'amex' | 'snack' | 'buffet'>('amex');
  const [locale, setLocale] = useState('es');
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!mesaNumero.trim()) return;
    setLoading(true);
    const res = await generateQRLink({ mesaNumero: mesaNumero.trim(), zona, locale });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setResult(res.value);
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Enlace copiado');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 border rounded-xl p-4">
        <div className="space-y-1.5">
          <Label htmlFor="mesa">Número de mesa</Label>
          <Input
            id="mesa"
            placeholder="Ej: Mesa 5, Sala VIP, Puerta 23"
            value={mesaNumero}
            onChange={(e) => setMesaNumero(e.target.value)}
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
                    : 'hover:bg-accent'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Idioma del QR</Label>
          <div className="flex gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLocale(l.value)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  locale === l.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent'
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
          <Link2 className="h-4 w-4 mr-2" />
          {loading ? 'Generando…' : 'Generar enlace QR'}
        </Button>
      </div>

      {result && (
        <div className="border rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">Enlace generado (expira en 4 h)</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={result.url}
              className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 font-mono truncate"
            />
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pega este enlace en cualquier generador de QR (ej. qr.io) e imprímelo para la mesa.
          </p>
        </div>
      )}
    </div>
  );
}
