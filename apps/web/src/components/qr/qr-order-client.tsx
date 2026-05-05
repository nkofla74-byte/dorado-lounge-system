'use client';

import { useState, useCallback, useId } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, ShoppingBag, CheckCircle2, Loader2, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPedidoFromQR } from '@/app/qr/[locale]/actions';
import type { PublicReceta, MesaInfo } from '@/app/qr/[locale]/actions';

interface CartItem {
  receta: PublicReceta;
  cantidad: number;
  notas: string;
}

const ZONA_DISPLAY: Record<string, string> = {
  amex: 'Amex',
  snack: 'Snack Bar',
  buffet: 'Buffet',
};

interface QROrderClientProps {
  recetas: PublicReceta[];
  mesa: MesaInfo;
  token: string;
}

export function QROrderClient({ recetas, mesa, token }: QROrderClientProps) {
  const t = useTranslations('qr');
  const idPrefix = useId();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [globalNotes, setGlobalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderError, setOrderError] = useState('');

  const totalItems = cart.reduce((s, c) => s + c.cantidad, 0);

  const increment = useCallback((receta: PublicReceta) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.receta.id === receta.id);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, cantidad: c.cantidad + 1 } : c));
      }
      return [...prev, { receta, cantidad: 1, notas: '' }];
    });
  }, []);

  const decrement = useCallback((recetaId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.receta.id === recetaId);
      if (idx < 0) return prev;
      const updated = { ...prev[idx]!, cantidad: prev[idx]!.cantidad - 1 };
      if (updated.cantidad <= 0) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => (i === idx ? updated : c));
    });
  }, []);

  const setItemNotes = useCallback((recetaId: string, notas: string) => {
    setCart((prev) => prev.map((c) => (c.receta.id === recetaId ? { ...c, notas } : c)));
  }, []);

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setLoading(true);
    setOrderError('');

    const idempotencyKey = `${idPrefix}-${Date.now()}`;
    const payload: Parameters<typeof createPedidoFromQR>[0] = {
      token,
      items: cart.map((c) => ({
        recetaId: c.receta.id,
        cantidad: c.cantidad,
        ...(c.notas ? { notas: c.notas } : {}),
      })),
      idempotencyKey,
    };
    if (globalNotes) payload.notas = globalNotes;
    const result = await createPedidoFromQR(payload);

    setLoading(false);
    if (!result.ok) {
      setOrderError(t('errorOrder'));
      return;
    }
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <h2 className="text-2xl font-bold">{t('successTitle')}</h2>
        <p className="text-muted-foreground max-w-xs">{t('successMessage')}</p>
        <Button
          variant="outline"
          onClick={() => {
            setCart([]);
            setGlobalNotes('');
            setSuccess(false);
          }}
        >
          {t('newOrder')}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">{t('mesa', { mesa: mesa.mesaNumero })}</p>
            <p className="text-xs text-muted-foreground">{ZONA_DISPLAY[mesa.zona] ?? mesa.zona}</p>
          </div>
          {totalItems > 0 && (
            <div className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-3 py-1 text-sm font-medium">
              <ShoppingBag className="h-3.5 w-3.5" />
              {totalItems}
            </div>
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        <h2 className="font-semibold text-base mb-3">{t('menu')}</h2>

        {recetas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <UtensilsCrossed className="h-10 w-10 opacity-40" />
            <p className="text-sm">Sin ítems disponibles</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recetas.map((receta) => {
              const cartItem = cart.find((c) => c.receta.id === receta.id);
              const qty = cartItem?.cantidad ?? 0;

              return (
                <div key={receta.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{receta.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {receta.porciones} {receta.porciones === 1 ? 'porción' : 'porciones'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 ? (
                        <>
                          <button
                            onClick={() => decrement(receta.id)}
                            className="flex items-center justify-center w-7 h-7 rounded-full border hover:bg-accent transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center font-medium text-sm tabular-nums">
                            {qty}
                          </span>
                          <button
                            onClick={() => increment(receta)}
                            className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => increment(receta)}
                          className="flex items-center justify-center w-7 h-7 rounded-full border hover:bg-accent transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {qty > 0 && (
                    <input
                      type="text"
                      placeholder={t('itemNotes')}
                      value={cartItem?.notas ?? ''}
                      onChange={(e) => setItemNotes(receta.id, e.target.value)}
                      className="w-full text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Global notes */}
        {cart.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('notes')}</label>
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={2}
              className="w-full text-sm border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        )}

        {orderError && <p className="mt-3 text-sm text-destructive text-center">{orderError}</p>}
      </main>

      {/* Sticky submit */}
      {cart.length > 0 && (
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-4 py-3">
          <div className="max-w-lg mx-auto">
            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('submitting')}
                </>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {t('submit')} · {totalItems} ítem{totalItems > 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
