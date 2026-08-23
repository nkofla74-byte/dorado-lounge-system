'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronDown,
  CheckCircle2,
  Minus,
  Plus,
  Send,
  Loader2,
  UtensilsCrossed,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { createPedido, toggleDisponibilidadPlato } from '@/modules/orders/actions';
import type { CartaReceta } from '@/modules/orders/actions';
import type { CategoriaMenu } from '@dorado/shared-types';

interface CartItem {
  recetaId: string;
  nombre: string;
  cantidad: number;
  notas: string;
}

interface Props {
  carta: CartaReceta[];
  onCreated: () => void;
  canToggle?: boolean;
}

const CATEGORIAS: CategoriaMenu[] = ['entrada', 'plato_fuerte', 'acompanante', 'postre'];
const genKey = () => `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function DishCard({
  receta,
  cartQty,
  onAdd,
  disabled,
  onToggle,
}: {
  receta: CartaReceta;
  cartQty: number;
  onAdd: (notas: string) => void;
  disabled?: boolean | undefined;
  onToggle?: (() => void) | undefined;
}) {
  const t = useTranslations('pedidos.carta');
  const [expanded, setExpanded] = useState(false);
  const [notas, setNotas] = useState('');
  const selected = cartQty > 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onAdd(notas);
  };

  return (
    <article
      className={cn(
        'rounded-2xl overflow-hidden border cursor-pointer select-none transition-all duration-300 active:scale-[0.99]',
        'bg-[#1C1C24]',
        disabled
          ? 'border-[#2a2a33] opacity-50 grayscale'
          : selected
            ? 'border-[#D4AF37] shadow-[0_0_24px_-6px_rgba(212,175,55,0.45)]'
            : expanded
              ? 'border-[#D4AF37]/60 shadow-[0_0_24px_-6px_rgba(212,175,55,0.35)]'
              : 'border-[#2a2a33] hover:border-[#D4AF37]/30 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.5)]',
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Imagen */}
      <div className="relative w-full aspect-[16/5] overflow-hidden bg-[#0B0B0F]">
        {receta.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receta.imagenUrl}
            alt={receta.nombre}
            className={cn(
              'w-full h-full object-cover transition-transform duration-700',
              expanded ? 'scale-105' : 'scale-100',
            )}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#1C1C24] via-[#2a2418] to-[#3a2f15]">
            <UtensilsCrossed className="h-6 w-6 text-[#D4AF37]/40" />
            <span className="text-[9px] tracking-[0.3em] uppercase text-[#D4AF37]/60 font-medium">
              Dorado Lounge
            </span>
          </div>
        )}
        {disabled && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-caption font-bold text-senal-critico uppercase tracking-wide bg-black/60 px-3 py-1 rounded-full">
              {t('inhabilitar')}
            </span>
          </div>
        )}
        {selected && !disabled && (
          <>
            <div className="absolute inset-0 bg-gradient-to-l from-black/40 via-transparent to-transparent" />
            <div className="absolute top-2 right-2 bg-[#D4AF37] text-[#0B0B0F] text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />x{cartQty}
            </div>
          </>
        )}
      </div>

      {/* Nombre + botón agregar */}
      <div className="px-3.5 pt-2.5 pb-3 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[#FAF7F0] text-[14px] font-bold leading-tight">{receta.nombre}</h3>
          {receta.descripcion && (
            <p
              className={cn(
                'text-[#FAF7F0]/55 text-[11.5px] mt-0.5 leading-snug',
                !expanded && 'line-clamp-1',
              )}
            >
              {receta.descripcion}
            </p>
          )}
        </div>
        {!disabled && (
          <button
            onClick={handleAdd}
            className={cn(
              'shrink-0 h-7 px-3 rounded-full font-semibold text-[11px] transition-all active:scale-90',
              selected
                ? 'bg-[#0B0B0F] border border-[#D4AF37]/60 text-[#D4AF37]'
                : 'text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_14px_-3px_rgba(212,175,55,0.7)]',
            )}
          >
            {selected ? (
              <span className="flex items-center gap-1">
                <Plus className="h-3 w-3" /> +1
              </span>
            ) : (
              'Agregar'
            )}
          </button>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 mt-0.5 text-[#D4AF37]/60 transition-transform duration-300',
            expanded && 'rotate-180',
          )}
        />
      </div>

      {/* Detalle expandible */}
      <div
        className="grid transition-[grid-template-rows] duration-400 ease-expresivo"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-[#2a2a33]/60">
            {receta.ingredientes.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] tracking-[0.2em] uppercase text-[#D4AF37]/70 font-semibold mb-1.5">
                  Ingredientes
                </p>
                <div className="flex flex-wrap gap-1">
                  {receta.ingredientes.map((ing, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-[#FAF7F0]/75 bg-[#0B0B0F] border border-[#2a2a33] rounded-full px-2 py-0.5"
                    >
                      {ing.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!disabled && (
              <textarea
                rows={1}
                placeholder="Nota especial…"
                value={notas}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full text-[12px] bg-[#0B0B0F] border border-[#2a2a33] text-[#FAF7F0] placeholder:text-[#FAF7F0]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] resize-none transition-colors"
              />
            )}

            {!disabled && (
              <button
                onClick={handleAdd}
                className="w-full h-9 rounded-full font-semibold text-[13px] text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_18px_-4px_rgba(212,175,55,0.6)] active:scale-[0.97] transition-all"
              >
                Agregar al pedido
              </button>
            )}

            {onToggle && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className={cn(
                  'w-full h-8 rounded-full font-semibold text-[12px] transition-all active:scale-[0.97] border',
                  disabled
                    ? 'border-senal-ok/40 text-senal-ok hover:bg-senal-ok/10'
                    : 'border-senal-critico/40 text-senal-critico hover:bg-senal-critico/10',
                )}
              >
                {disabled ? t('habilitar') : t('inhabilitar')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

type Step = 'setup' | 'menu';

export function CartaAmex({ carta, onCreated, canToggle = false }: Props) {
  const t = useTranslations('pedidos.carta');
  const tCat = useTranslations('categoriasMenu');
  const [step, setStep] = useState<Step>('setup');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mesa, setMesa] = useState('');
  const [comensales, setComensales] = useState(1);
  const [comensalActual, setComensalActual] = useState(1);
  const [notasPedido, setNotasPedido] = useState('');
  const [sending, setSending] = useState(false);
  const idempotencyKeyRef = useRef(genKey());
  const [disabledIds, setDisabledIds] = useState<Set<string>>(
    () => new Set(carta.filter((r) => !r.activo).map((r) => r.id)),
  );

  const handleToggle = async (receta: CartaReceta) => {
    const newActivo = disabledIds.has(receta.id);
    setDisabledIds((prev) => {
      const next = new Set(prev);
      if (newActivo) next.delete(receta.id);
      else next.add(receta.id);
      return next;
    });
    const result = await toggleDisponibilidadPlato(receta.id, newActivo);
    if (!result.ok) {
      toast.error(result.error.message);
      setDisabledIds((prev) => {
        const next = new Set(prev);
        if (newActivo) next.add(receta.id);
        else next.delete(receta.id);
        return next;
      });
      return;
    }
    toast.success(newActivo ? t('platoHabilitado') : t('platoInhabilitado'));
  };

  const available = CATEGORIAS.filter((cat) => carta.some((r) => r.categoriaMenu === cat));
  const sinCategoria = carta.filter(
    (r) => !r.categoriaMenu || !CATEGORIAS.includes(r.categoriaMenu as CategoriaMenu),
  );
  const [activeCategory, setActiveCategory] = useState<CategoriaMenu | 'otros'>(
    available[0] ?? 'entrada',
  );

  const currentRecetas =
    activeCategory === 'otros'
      ? sinCategoria
      : carta.filter((r) => r.categoriaMenu === activeCategory);

  const addToCart = (receta: CartaReceta, notas: string) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.recetaId === receta.id);
      if (existing) {
        return prev.map((c) =>
          c.recetaId === receta.id ? { ...c, cantidad: c.cantidad + 1, notas } : c,
        );
      }
      return [...prev, { recetaId: receta.id, nombre: receta.nombre, cantidad: 1, notas }];
    });
  };

  const updateQty = (recetaId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.recetaId === recetaId ? { ...c, cantidad: c.cantidad + delta } : c))
        .filter((c) => c.cantidad > 0),
    );
  };

  const totalItems = cart.reduce((sum, c) => sum + c.cantidad, 0);

  const handleSend = async () => {
    if (cart.length === 0) return;
    setSending(true);
    try {
      const allNotas = cart
        .filter((c) => c.notas)
        .map((c) => `${c.nombre}: ${c.notas}`)
        .join(' | ');
      const comensalesNota = comensales > 1 ? `${comensales} comensales` : '';
      const finalNotas = [comensalesNota, notasPedido.trim(), allNotas].filter(Boolean).join(' — ');

      const result = await createPedido({
        zona: 'amex',
        idempotencyKey: idempotencyKeyRef.current,
        numeroMesa: mesa.trim() || undefined,
        notas: finalNotas || undefined,
        items: cart.map((c) => ({ recetaId: c.recetaId, cantidad: c.cantidad })),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      idempotencyKeyRef.current = genKey();
      setCart([]);
      setNotasPedido('');
      onCreated();

      if (comensalActual < comensales) {
        toast.success(t('pedidoEnviadoComensal', { n: comensalActual, total: comensales }));
        setComensalActual((n) => n + 1);
      } else {
        toast.success(t('pedidoEnviado'));
        setMesa('');
        setComensales(1);
        setComensalActual(1);
        setStep('setup');
      }
    } finally {
      setSending(false);
    }
  };

  const cartQtyMap = new Map(cart.map((c) => [c.recetaId, c.cantidad]));

  if (step === 'setup') {
    return (
      <div className="rounded-2xl bg-[#0B0B0F] text-[#FAF7F0] overflow-hidden border border-[#2a2a33]">
        <div className="px-6 py-10 flex flex-col items-center gap-8">
          <div className="text-center space-y-2">
            <UtensilsCrossed className="h-10 w-10 mx-auto text-[#D4AF37]/60" />
            <h2 className="text-lg font-bold text-[#FAF7F0]">{t('setupTitle')}</h2>
            <p className="text-sm text-[#FAF7F0]/50">{t('setupDescription')}</p>
          </div>

          <div className="w-full max-w-xs space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="setup-mesa"
                className="text-caption text-[#D4AF37] uppercase tracking-wide font-semibold"
              >
                {t('mesa')}
              </label>
              <Input
                id="setup-mesa"
                placeholder={t('mesaPlaceholder')}
                className="h-10 text-sm bg-[#1C1C24] border-[#2a2a33] text-[#FAF7F0] placeholder:text-[#FAF7F0]/30 text-center"
                value={mesa}
                onChange={(e) => setMesa(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="setup-comensales"
                className="text-caption text-[#D4AF37] uppercase tracking-wide font-semibold"
              >
                {t('comensales')}
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  className="h-10 w-10 rounded-full border border-[#2a2a33] flex items-center justify-center text-[#FAF7F0]/70 hover:bg-[#2a2a33] transition-colors disabled:opacity-30"
                  disabled={comensales <= 1}
                  onClick={() => setComensales((n) => Math.max(1, n - 1))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-3xl font-bold tabular-nums text-[#FAF7F0] w-12 text-center">
                  {comensales}
                </span>
                <button
                  type="button"
                  className="h-10 w-10 rounded-full border border-[#2a2a33] flex items-center justify-center text-[#FAF7F0]/70 hover:bg-[#2a2a33] transition-colors disabled:opacity-30"
                  disabled={comensales >= 20}
                  onClick={() => setComensales((n) => Math.min(20, n + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('menu')}
              className="w-full h-11 rounded-full font-bold text-[14px] text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_18px_-4px_rgba(212,175,55,0.6)] active:scale-[0.97] transition-all mt-4 flex items-center justify-center gap-2"
            >
              {t('verCarta')}
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#0B0B0F] text-[#FAF7F0] overflow-hidden border border-[#2a2a33]">
      {/* Header con tabs de categoría */}
      <div className="sticky top-0 z-10 bg-[#0B0B0F]/95 backdrop-blur-md border-b border-[#1C1C24] px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-wide uppercase text-[#D4AF37]">
              {t('cartaTitle')}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-[#FAF7F0]/60">
              {mesa && (
                <span className="bg-[#1C1C24] border border-[#2a2a33] rounded px-1.5 py-0.5">
                  {t('mesa')}: {mesa}
                </span>
              )}
              {comensales > 1 ? (
                <span className="bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] rounded px-1.5 py-0.5 font-semibold">
                  {t('comensalDe', { n: comensalActual, total: comensales })}
                </span>
              ) : (
                <span className="bg-[#1C1C24] border border-[#2a2a33] rounded px-1.5 py-0.5">
                  1 {t('comensales').toLowerCase()}
                </span>
              )}
              <button
                type="button"
                onClick={() => setStep('setup')}
                className="text-[#D4AF37] hover:underline"
              >
                {t('cambiar')}
              </button>
            </div>
          </div>
          {totalItems > 0 && (
            <span className="text-caption bg-[#D4AF37] text-[#0B0B0F] rounded-full px-3 py-1 font-bold tabular-nums">
              {t('pedidoTitle', { count: totalItems })}
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          {available.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'shrink-0 text-caption font-semibold px-4 py-2 rounded-full border transition-all active:scale-95',
                activeCategory === cat
                  ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37] shadow-[0_0_16px_-4px_rgba(212,175,55,0.5)]'
                  : 'border-[#2a2a33] text-[#FAF7F0]/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40',
              )}
            >
              {tCat(cat)}
            </button>
          ))}
          {sinCategoria.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('otros')}
              className={cn(
                'shrink-0 text-caption font-semibold px-4 py-2 rounded-full border transition-all active:scale-95',
                activeCategory === 'otros'
                  ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37]'
                  : 'border-[#2a2a33] text-[#FAF7F0]/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40',
              )}
            >
              {t('otros')}
            </button>
          )}
        </div>
      </div>

      {/* Platos */}
      <div className="px-4 py-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
        {currentRecetas.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-[#FAF7F0]/40">
            <UtensilsCrossed className="h-8 w-8 opacity-50" />
            <p className="text-sm">{t('sinPlatos')}</p>
          </div>
        ) : (
          currentRecetas.map((receta) => (
            <DishCard
              key={receta.id}
              receta={receta}
              cartQty={cartQtyMap.get(receta.id) ?? 0}
              onAdd={(notas) => addToCart(receta, notas)}
              disabled={disabledIds.has(receta.id)}
              onToggle={canToggle ? () => handleToggle(receta) : undefined}
            />
          ))
        )}
      </div>

      {/* Carrito */}
      {cart.length > 0 && (
        <div className="border-t border-[#D4AF37]/30 bg-[#1C1C24] px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#FAF7F0]">
              {t('pedidoTitle', { count: totalItems })}
            </h3>
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-caption text-[#FAF7F0]/50 hover:text-[#FAF7F0] transition-colors"
            >
              {t('limpiar')}
            </button>
          </div>

          <div className="space-y-1.5">
            {cart.map((item) => (
              <div key={item.recetaId} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1 text-[#FAF7F0]/90">{item.nombre}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="h-6 w-6 rounded border border-[#2a2a33] flex items-center justify-center text-[#FAF7F0]/70 hover:bg-[#2a2a33] transition-colors"
                    onClick={() => updateQty(item.recetaId, -1)}
                  >
                    {item.cantidad === 1 ? (
                      <Trash2 className="h-3 w-3 text-senal-critico" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </button>
                  <span className="w-6 text-center tabular-nums font-bold text-[#D4AF37]">
                    {item.cantidad}
                  </span>
                  <button
                    type="button"
                    className="h-6 w-6 rounded border border-[#2a2a33] flex items-center justify-center text-[#FAF7F0]/70 hover:bg-[#2a2a33] transition-colors"
                    onClick={() => updateQty(item.recetaId, 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="cart-notas"
              className="text-[10px] text-[#FAF7F0]/50 uppercase tracking-wide"
            >
              {t('notas')}
            </label>
            <Input
              id="cart-notas"
              placeholder={t('notasPlaceholder')}
              className="h-8 text-sm bg-[#0B0B0F] border-[#2a2a33] text-[#FAF7F0] placeholder:text-[#FAF7F0]/30"
              value={notasPedido}
              onChange={(e) => setNotasPedido(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="w-full h-10 rounded-full font-bold text-[13px] text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_18px_-4px_rgba(212,175,55,0.6)] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending
              ? t('enviando')
              : comensales > 1 && comensalActual < comensales
                ? t('enviarYSiguiente')
                : t('enviar')}
          </button>
        </div>
      )}
    </div>
  );
}
