'use client';

import { useState, useId, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  Wifi,
  Star,
  UtensilsCrossed,
  Users,
  ArrowRight,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPedidoFromQR } from '@/app/qr/[locale]/actions';
import type { PublicReceta, MesaInfo, CategoriaMenu } from '@/app/qr/[locale]/actions';
import { useOfflineSync } from '@/lib/offline/use-offline-sync';
import { enqueueOrder } from '@/lib/offline/queue';
import { OfflineBanner } from '@/components/qr/offline-banner';
import { TurnstileWidget } from '@/components/ui/turnstile-widget';

const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// ─── tipos ────────────────────────────────────────────────────────────────────

interface CartItem {
  receta: PublicReceta;
  notas: string;
}

type Step = 'welcome' | 'hub' | 'comensales' | 'menu' | 'done';

// ─── i18n estático (el locale viene del layout next-intl pero aquí lo gestionamos nosotros) ──
// Se complementa con las traducciones de next-intl; este objeto cubre las pantallas nuevas.

const TEXTS: Record<string, Record<string, string>> = {
  es: {
    selectLanguage: 'Selecciona tu idioma',
    tagline: 'Sala VIP · El Dorado',
    cardholderLegal: 'Acceso para tarjetahabientes American Express',
    welcome: '¡Bienvenido!',
    hub_menu: 'Menú',
    hub_wifi: 'Conéctate a Wi-Fi',
    hub_experience: 'Tu experiencia con nosotros',
    hub_benefits: 'Beneficios Amex',
    howManyGuests: '¿Cuántas personas hay en tu mesa?',
    guestsPlaceholder: 'Ingresa la cantidad de personas',
    continueCta: 'Continuar',
    guestLabel: 'Comensal',
    of: 'de',
    categories_entrada: 'Entradas',
    categories_plato_fuerte: 'Plato fuerte',
    categories_acompanante: 'Acompañantes',
    viewIngredients: 'Ver ingredientes',
    hideIngredients: 'Ocultar ingredientes',
    notePlaceholder: 'Agrega una nota para este plato…',
    addDish: 'Agregar plato',
    noItems: 'El comensal no seleccionó platos',
    confirmOrder: 'Confirmar pedido',
    sending: 'Enviando…',
    nextGuest: 'Siguiente comensal',
    allDone: '¡Todos los pedidos fueron enviados!',
    enjoyMessage: 'Disfruta tu experiencia en el Dorado Lounge.',
    newSession: 'Nueva sesión',
    wifi_title: 'Wi-Fi Dorado Lounge',
    wifi_name: 'American Express',
    wifi_pass: 'AmexLounge2025.',
    wifi_connect_title: 'Conéctate',
    wifi_connect_subtitle: 'desde nuestra sala VIP',
    wifi_network_label: 'Nombre de la red',
    wifi_password_label: 'Contraseña',
    benefits_title: 'Beneficios American Express',
    benefits_text:
      'Como titular de American Express disfruta de acceso prioritario, menú exclusivo y atención preferencial en el Dorado Lounge.',
    benefits_cta: 'Ver ofertas y beneficios',
    experience_title: 'Tu experiencia con nosotros',
    experience_text:
      'El Dorado Lounge te ofrece gastronomía de calidad, bebidas premium y conectividad de primer nivel en el Aeropuerto El Dorado, Bogotá.',
    errorOrder: 'No se pudo enviar el pedido. Intenta de nuevo.',
    back: 'Volver',
    added: 'Añadido',
    dishSingular: 'plato',
    dishPlural: 'platos',
    noDishesAvailable: 'No hay platos disponibles',
    selectAtLeastOne: 'Selecciona al menos un plato para continuar',
  },
  en: {
    selectLanguage: 'Select your language',
    tagline: 'VIP Lounge · El Dorado',
    cardholderLegal: 'Access for American Express cardholders',
    welcome: 'Welcome!',
    hub_menu: 'Menu',
    hub_wifi: 'Connect to Wi-Fi',
    hub_experience: 'Your experience with us',
    hub_benefits: 'Amex Benefits',
    howManyGuests: 'How many guests are at your table?',
    guestsPlaceholder: 'Enter the number of guests',
    continueCta: 'Continue',
    guestLabel: 'Guest',
    of: 'of',
    categories_entrada: 'Starters',
    categories_plato_fuerte: 'Main Course',
    categories_acompanante: 'Sides',
    viewIngredients: 'View ingredients',
    hideIngredients: 'Hide ingredients',
    notePlaceholder: 'Add a note for this dish…',
    addDish: 'Add dish',
    noItems: 'The guest did not select any dish',
    confirmOrder: 'Confirm order',
    sending: 'Sending…',
    nextGuest: 'Next guest',
    allDone: 'All orders have been sent!',
    enjoyMessage: 'Enjoy your experience at Dorado Lounge.',
    newSession: 'New session',
    wifi_title: 'Dorado Lounge Wi-Fi',
    wifi_name: 'American Express',
    wifi_pass: 'AmexLounge2025.',
    wifi_connect_title: 'Connect',
    wifi_connect_subtitle: 'from our VIP lounge',
    wifi_network_label: 'Network name',
    wifi_password_label: 'Password',
    benefits_title: 'American Express Benefits',
    benefits_text:
      'As an American Express cardholder, enjoy priority access, exclusive menu and preferred service at Dorado Lounge.',
    benefits_cta: 'View offers and benefits',
    experience_title: 'Your experience with us',
    experience_text:
      'Dorado Lounge offers quality cuisine, premium beverages and first-class connectivity at El Dorado Airport, Bogotá.',
    errorOrder: 'Could not send order. Please try again.',
    back: 'Back',
    added: 'Added',
    dishSingular: 'dish',
    dishPlural: 'dishes',
    noDishesAvailable: 'No dishes available',
    selectAtLeastOne: 'Select at least one dish to continue',
  },
  fr: {
    selectLanguage: 'Sélectionnez votre langue',
    tagline: 'Salon VIP · El Dorado',
    cardholderLegal: 'Accès pour les titulaires American Express',
    welcome: 'Bienvenue !',
    hub_menu: 'Menu',
    hub_wifi: 'Connexion Wi-Fi',
    hub_experience: 'Votre expérience avec nous',
    hub_benefits: 'Avantages Amex',
    howManyGuests: 'Combien de personnes êtes-vous à table ?',
    guestsPlaceholder: 'Entrez le nombre de personnes',
    continueCta: 'Continuer',
    guestLabel: 'Convive',
    of: 'sur',
    categories_entrada: 'Entrées',
    categories_plato_fuerte: 'Plat principal',
    categories_acompanante: 'Accompagnements',
    viewIngredients: 'Voir les ingrédients',
    hideIngredients: 'Masquer les ingrédients',
    notePlaceholder: 'Ajoutez une note pour ce plat…',
    addDish: 'Ajouter le plat',
    noItems: "Le convive n'a sélectionné aucun plat",
    confirmOrder: 'Confirmer la commande',
    sending: 'Envoi…',
    nextGuest: 'Convive suivant',
    allDone: 'Toutes les commandes ont été envoyées !',
    enjoyMessage: 'Profitez de votre expérience au Dorado Lounge.',
    newSession: 'Nouvelle session',
    wifi_title: 'Wi-Fi Dorado Lounge',
    wifi_name: 'American Express',
    wifi_pass: 'AmexLounge2025.',
    wifi_connect_title: 'Connectez-vous',
    wifi_connect_subtitle: 'depuis notre salon VIP',
    wifi_network_label: 'Nom du réseau',
    wifi_password_label: 'Mot de passe',
    benefits_title: 'Avantages American Express',
    benefits_text:
      "En tant que titulaire American Express, profitez d'un accès prioritaire, d'un menu exclusif et d'un service préférentiel.",
    benefits_cta: 'Voir offres et avantages',
    experience_title: 'Votre expérience avec nous',
    experience_text:
      "Le Dorado Lounge vous propose une gastronomie de qualité, des boissons premium et une connectivité haut de gamme à l'aéroport El Dorado, Bogotá.",
    errorOrder: "Impossible d'envoyer la commande. Veuillez réessayer.",
    back: 'Retour',
    added: 'Ajouté',
    dishSingular: 'plat',
    dishPlural: 'plats',
    noDishesAvailable: 'Aucun plat disponible',
    selectAtLeastOne: 'Sélectionnez au moins un plat pour continuer',
  },
  pt: {
    selectLanguage: 'Selecione o seu idioma',
    tagline: 'Sala VIP · El Dorado',
    cardholderLegal: 'Acesso para titulares American Express',
    welcome: 'Bem-vindo!',
    hub_menu: 'Menu',
    hub_wifi: 'Conectar ao Wi-Fi',
    hub_experience: 'Sua experiência conosco',
    hub_benefits: 'Benefícios Amex',
    howManyGuests: 'Quantas pessoas há na sua mesa?',
    guestsPlaceholder: 'Informe a quantidade de pessoas',
    continueCta: 'Continuar',
    guestLabel: 'Comensal',
    of: 'de',
    categories_entrada: 'Entradas',
    categories_plato_fuerte: 'Prato principal',
    categories_acompanante: 'Acompanhamentos',
    viewIngredients: 'Ver ingredientes',
    hideIngredients: 'Ocultar ingredientes',
    notePlaceholder: 'Adicione uma observação para este prato…',
    addDish: 'Adicionar prato',
    noItems: 'O comensal não selecionou nenhum prato',
    confirmOrder: 'Confirmar pedido',
    sending: 'Enviando…',
    nextGuest: 'Próximo comensal',
    allDone: 'Todos os pedidos foram enviados!',
    enjoyMessage: 'Aproveite sua experiência no Dorado Lounge.',
    newSession: 'Nova sessão',
    wifi_title: 'Wi-Fi Dorado Lounge',
    wifi_name: 'American Express',
    wifi_pass: 'AmexLounge2025.',
    wifi_connect_title: 'Conecte-se',
    wifi_connect_subtitle: 'do nosso lounge VIP',
    wifi_network_label: 'Nome da rede',
    wifi_password_label: 'Senha',
    benefits_title: 'Benefícios American Express',
    benefits_text:
      'Como titular American Express, aproveite acesso prioritário, menu exclusivo e atendimento preferencial no Dorado Lounge.',
    benefits_cta: 'Ver ofertas e benefícios',
    experience_title: 'Sua experiência conosco',
    experience_text:
      'O Dorado Lounge oferece gastronomia de qualidade, bebidas premium e conectividade de alto nível no Aeroporto El Dorado, Bogotá.',
    errorOrder: 'Não foi possível enviar o pedido. Tente novamente.',
    back: 'Voltar',
    added: 'Adicionado',
    dishSingular: 'prato',
    dishPlural: 'pratos',
    noDishesAvailable: 'Nenhum prato disponível',
    selectAtLeastOne: 'Selecione pelo menos um prato para continuar',
  },
};

const CATEGORY_ORDER: CategoriaMenu[] = ['entrada', 'plato_fuerte', 'acompanante'];

const LOCALES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
];

// ─── Wordmark Dorado Lounge — identidad propia, sin trade dress AmEx ─────────
function DoradoLogo({
  size = 'md',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: { title: 'text-xl', sub: 'text-[8px]', gap: 'gap-1.5', rule: 'w-8' },
    md: { title: 'text-3xl', sub: 'text-[10px]', gap: 'gap-2', rule: 'w-10' },
    lg: { title: 'text-5xl', sub: 'text-xs', gap: 'gap-3', rule: 'w-14' },
  } as const;
  const s = sizes[size];
  return (
    <div className={`flex flex-col items-center ${s.gap} ${className}`}>
      <span
        className={`font-serif ${s.title} font-medium tracking-[0.18em] text-[#FAF7F0] leading-none`}
      >
        DORADO
      </span>
      <span
        aria-hidden
        className={`${s.rule} h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent`}
      />
      <span
        className={`${s.sub} font-sans font-semibold tracking-[0.45em] uppercase text-[#D4AF37]`}
      >
        Lounge
      </span>
    </div>
  );
}

// ─── Componente plato — tarjeta colapsada con expand animado ──────────────────
function DishCard({
  receta,
  locale,
  onAdd,
  selected,
  index,
}: {
  receta: PublicReceta;
  locale: string;
  onAdd: (item: CartItem) => void;
  selected: boolean;
  index: number;
}) {
  const t = TEXTS[locale] ?? TEXTS['es']!;
  const [expanded, setExpanded] = useState(false);
  const [notas, setNotas] = useState('');
  const [pulseBadge, setPulseBadge] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (selected) {
      setPulseBadge(true);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulseBadge(false), 400);
    }
  }, [selected]);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAdd({ receta, notas });
    setExpanded(false);
  };

  // Delay escalonado calculado dinámicamente
  const animDelay = Math.min(index * 70, 350);

  return (
    <article
      className={`dish-card rounded-2xl overflow-hidden border bg-[#1C1C24] cursor-pointer select-none transition-all duration-300 active:scale-[0.99] ${
        selected
          ? 'border-[#D4AF37] shadow-[0_0_24px_-6px_rgba(212,175,55,0.45)]'
          : expanded
            ? 'border-[#D4AF37]/60 shadow-[0_0_24px_-6px_rgba(212,175,55,0.35)]'
            : 'border-[#2a2a33] hover:border-[#D4AF37]/30 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.5)]'
      }`}
      style={{
        animation: `dishFadeIn 0.45s cubic-bezier(0.22,1,0.36,1) ${animDelay}ms both`,
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Foto banner 16:5 */}
      <div className="relative w-full aspect-[16/5] overflow-hidden bg-[#0B0B0F]">
        {receta.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receta.imagenUrl}
            alt={receta.nombre}
            className={`w-full h-full object-cover transition-transform duration-700 ${
              expanded ? 'scale-105' : 'scale-100'
            }`}
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
        {selected && (
          <>
            <div className="absolute inset-0 bg-gradient-to-l from-black/40 via-transparent to-transparent" />
            <div
              className={`absolute top-2 right-2 bg-[#D4AF37] text-[#0B0B0F] text-[11px] font-bold px-2 py-0.5 rounded-full shadow-lg flex items-center gap-1 transition-transform duration-300 ${
                pulseBadge ? 'scale-125' : 'scale-100'
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              {t['added']}
            </div>
          </>
        )}
      </div>

      {/* Cabecera siempre visible */}
      <div className="px-3.5 pt-2.5 pb-3 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[#FAF7F0] text-[14px] font-bold leading-tight">{receta.nombre}</h3>
          {receta.descripcion && (
            <p
              className={`text-[#FAF7F0]/55 text-[11.5px] mt-0.5 leading-snug ${expanded ? '' : 'line-clamp-1'}`}
            >
              {receta.descripcion}
            </p>
          )}
        </div>
        <button
          onClick={handleAdd}
          className={`shrink-0 h-7 px-3 rounded-full font-semibold text-[11px] transition-all active:scale-90 ${
            selected
              ? 'bg-[#0B0B0F] border border-[#D4AF37]/60 text-[#D4AF37]'
              : 'text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_14px_-3px_rgba(212,175,55,0.7)]'
          }`}
        >
          {selected ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {t['added']}
            </span>
          ) : (
            t['addDish']
          )}
        </button>
        <ChevronDown
          className={`h-4 w-4 mt-0.5 text-[#D4AF37]/60 transition-transform duration-300 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Detalle expandible */}
      <div
        className="grid transition-[grid-template-rows] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-[#2a2a33]/60">
            {/* Ingredientes */}
            {receta.ingredientes.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] tracking-[0.2em] uppercase text-[#D4AF37]/70 font-semibold mb-1.5">
                  {t['viewIngredients']}
                </p>
                <div className="flex flex-wrap gap-1">
                  {receta.ingredientes.map((ing, i) => (
                    <span
                      key={i}
                      className="text-[10px] text-[#FAF7F0]/75 bg-[#0B0B0F] border border-[#2a2a33] rounded-full px-2 py-0.5"
                      style={{
                        animation: expanded ? `dishFadeIn 0.3s ease-out ${i * 25}ms both` : 'none',
                      }}
                    >
                      {ing.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Nota */}
            <textarea
              rows={1}
              placeholder={t['notePlaceholder']}
              value={notas}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full text-[12px] bg-[#0B0B0F] border border-[#2a2a33] text-[#FAF7F0] placeholder:text-[#FAF7F0]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] resize-none transition-colors"
            />

            {/* CTA principal */}
            <button
              onClick={handleAdd}
              className="w-full h-9 rounded-full font-semibold text-[13px] text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_18px_-4px_rgba(212,175,55,0.6)] active:scale-[0.97] transition-all"
            >
              {selected ? (
                <span className="flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {t['added']}
                </span>
              ) : (
                t['addDish']
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Pantalla menú por comensal ───────────────────────────────────────────────
function MenuScreen({
  recetas,
  locale,
  currentComensal,
  totalComensales,
  onConfirm,
  loading,
  error,
}: {
  recetas: PublicReceta[];
  locale: string;
  currentComensal: number;
  totalComensales: number;
  onConfirm: (items: CartItem[]) => void;
  loading: boolean;
  error: string;
}) {
  const t = TEXTS[locale] ?? TEXTS['es']!;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [emptyWarning, setEmptyWarning] = useState(false);
  const emptyWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (emptyWarningTimerRef.current) clearTimeout(emptyWarningTimerRef.current);
    };
  }, []);

  const byCategory = CATEGORY_ORDER.reduce<Record<string, PublicReceta[]>>((acc, cat) => {
    acc[cat] = recetas.filter((r) => r.categoriaMenu === cat);
    return acc;
  }, {});

  const availableCategories = CATEGORY_ORDER.filter((c) => (byCategory[c]?.length ?? 0) > 0);
  const [activeCategory, setActiveCategory] = useState<CategoriaMenu>(
    availableCategories[0] ?? 'entrada',
  );

  // Regla: 1 plato por categoría (entrada, plato fuerte, acompañante).
  // Agregar uno nuevo de la misma categoría reemplaza al anterior.
  const addItem = (item: CartItem) => {
    setCart((prev) => {
      const filtered = prev.filter((c) => c.receta.categoriaMenu !== item.receta.categoriaMenu);
      return [...filtered, item];
    });
  };

  const totalItems = cart.length;
  const inCartIds = new Set(cart.map((c) => c.receta.id));

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0B0B0F] text-[#FAF7F0]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0B0B0F]/95 backdrop-blur-md border-b border-[#1C1C24] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p
              className="text-[10px] tracking-[0.3em] uppercase font-bold"
              style={{ color: '#D4AF37' }}
            >
              {t['guestLabel']} {currentComensal} {t['of']} {totalComensales}
            </p>
          </div>
          {totalItems > 0 && (
            <span className="text-xs bg-[#D4AF37] text-[#0B0B0F] rounded-full px-3 py-1 font-bold tabular-nums shadow-[0_0_12px_-2px_rgba(212,175,55,0.5)]">
              {totalItems} {totalItems === 1 ? t['dishSingular'] : t['dishPlural']}
            </span>
          )}
        </div>
        {/* Tabs de categoría */}
        {availableCategories.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5 -mx-1 px-1">
            {availableCategories.map((cat) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 text-xs font-semibold px-4 py-2 rounded-full border transition-all active:scale-95 ${
                    active
                      ? 'bg-[#D4AF37] text-[#0B0B0F] border-[#D4AF37] shadow-[0_0_16px_-4px_rgba(212,175,55,0.5)]'
                      : 'border-[#2a2a33] text-[#FAF7F0]/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40'
                  }`}
                >
                  {t[`categories_${cat}`]}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Lista de platos — key compuesto fuerza re-animación al cambiar categoría */}
      <main key={activeCategory} className="flex-1 px-4 py-4 space-y-2.5">
        {(byCategory[activeCategory] ?? []).length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-[#FAF7F0]/40">
            <UtensilsCrossed className="h-10 w-10 opacity-50" />
            <p className="text-sm">{t['noDishesAvailable']}</p>
          </div>
        ) : (
          (byCategory[activeCategory] ?? []).map((receta, idx) => (
            <DishCard
              key={`${activeCategory}-${receta.id}`}
              receta={receta}
              locale={locale}
              onAdd={addItem}
              selected={inCartIds.has(receta.id)}
              index={idx}
            />
          ))
        )}
      </main>

      {error && <p className="px-4 pb-2 text-sm text-red-400 text-center">{error}</p>}

      {/* CTA fijo */}
      <div className="sticky bottom-0 bg-[#0B0B0F]/95 backdrop-blur-md border-t border-[#1C1C24] px-4 py-3 safe-pb space-y-2">
        {emptyWarning && (
          <p className="text-xs text-[#D4AF37] text-center font-medium">{t['selectAtLeastOne']}</p>
        )}
        <button
          className="w-full h-12 rounded-full font-bold text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_28px_-6px_rgba(212,175,55,0.7)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:shadow-none"
          onClick={() => {
            if (cart.length === 0) {
              setEmptyWarning(true);
              if (emptyWarningTimerRef.current) clearTimeout(emptyWarningTimerRef.current);
              emptyWarningTimerRef.current = setTimeout(() => setEmptyWarning(false), 3000);
              return;
            }
            setEmptyWarning(false);
            onConfirm(cart);
          }}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t['sending']}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              {t['confirmOrder']}
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────
interface QRPassengerAppProps {
  recetas: PublicReceta[];
  mesa: MesaInfo;
  token: string;
  initialLocale: string;
}

export function QRPassengerApp({ recetas, mesa, token, initialLocale }: QRPassengerAppProps) {
  const router = useRouter();
  const idPrefix = useId();
  const [locale, setLocale] = useState(initialLocale);
  const [step, setStep] = useState<Step>('welcome');
  const [hubView, setHubView] = useState<'main' | 'wifi' | 'benefits' | 'experience'>('main');
  const [totalComensales, setTotalComensales] = useState(1);
  const [guestInput, setGuestInput] = useState('');
  const [currentComensal, setCurrentComensal] = useState(1);
  const [loading, setLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const orderCountRef = useRef(0);
  const { isOnline, pendingCount, syncing } = useOfflineSync();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const t = TEXTS[locale] ?? TEXTS['es']!;

  const handleLocaleSelect = (code: string) => {
    setLocale(code);
    setStep('hub');
    router.replace(`/qr/${code}?t=${token}`, { scroll: false });
  };

  const handleGuestsConfirm = () => {
    const n = parseInt(guestInput, 10);
    if (!n || n < 1 || n > 20) return;
    setTotalComensales(n);
    setCurrentComensal(1);
    setStep('menu');
  };

  const handleConfirmOrder = async (items: CartItem[]) => {
    setLoading(true);
    setOrderError('');

    orderCountRef.current += 1;
    const idempotencyKey = `${idPrefix}-c${currentComensal}-${orderCountRef.current}`;

    if (items.length > 0) {
      // Online + Turnstile activo: exigir token. Offline encola sin token (rate limit + idempotencia cubren).
      if (isOnline && TURNSTILE_ENABLED && !turnstileToken) {
        setOrderError(t['errorOrder'] ?? '');
        setLoading(false);
        return;
      }

      const orderInput = {
        token,
        items: items.map((i) => ({
          recetaId: i.receta.id,
          cantidad: 1,
          ...(i.notas ? { notas: i.notas } : {}),
        })),
        notas: `Comensal ${currentComensal} de ${totalComensales}`,
        idempotencyKey,
        ...(turnstileToken ? { turnstileToken } : {}),
      };

      if (!isOnline) {
        // Sin red: guardar en cola y continuar (idempotencyKey garantiza entrega única)
        try {
          await enqueueOrder({ id: idempotencyKey, input: orderInput });
        } catch {
          setOrderError(t['errorOrder'] ?? '');
          setLoading(false);
          return;
        }
      } else {
        const result = await createPedidoFromQR(orderInput);
        if (!result.ok) {
          // Si cayó la red durante el envío, encolar para reintento
          if (!navigator.onLine) {
            try {
              await enqueueOrder({ id: idempotencyKey, input: orderInput });
            } catch {
              setOrderError(t['errorOrder'] ?? '');
              setLoading(false);
              return;
            }
          } else {
            setOrderError(t['errorOrder'] ?? '');
            setLoading(false);
            return;
          }
        }
        // Token Turnstile es de un solo uso — pedir uno nuevo para el siguiente pedido.
        if (TURNSTILE_ENABLED) {
          setTurnstileToken(null);
          setTurnstileResetKey((k) => k + 1);
        }
      }
    }

    setLoading(false);

    if (currentComensal < totalComensales) {
      setCurrentComensal((n) => n + 1);
      // step sigue siendo 'menu', el componente se re-monta con nueva key
    } else {
      setStep('done');
    }
  };

  // ── Welcome ──────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <>
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          syncing={syncing}
          locale={locale}
        />
        <div className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12 bg-[#0B0B0F] text-[#FAF7F0] relative overflow-hidden">
          {/* Halo dorado decorativo */}
          <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-[#D4AF37]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[#D4AF37]/5 blur-3xl" />

          {/* Logo top */}
          <div className="relative">
            <DoradoLogo size="lg" />
          </div>

          <div className="relative w-full space-y-7 text-center">
            <div className="space-y-2">
              <h1 className="font-serif text-xl tracking-[0.18em] uppercase text-[#FAF7F0]/90">
                {t['tagline']}
              </h1>
              <p className="text-[#FAF7F0]/55 text-sm">{t['selectLanguage']}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => handleLocaleSelect(l.code)}
                  className={`py-4 rounded-2xl font-medium text-base transition-all active:scale-95 ${
                    locale === l.code
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] text-[#0B0B0F] shadow-[0_0_24px_-4px_rgba(212,175,55,0.55)]'
                      : 'bg-[#1C1C24] border border-[#2a2a33] text-[#FAF7F0]/80 hover:border-[#D4AF37]/40 hover:text-[#D4AF37]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Línea legal (fair use nominativo) */}
          <p className="relative text-[10px] text-[#FAF7F0]/35 tracking-[0.15em] uppercase text-center max-w-xs">
            {t['cardholderLegal']}
          </p>
        </div>
      </>
    );
  }

  // ── Hub ──────────────────────────────────────────────────────────────────
  if (step === 'hub') {
    if (hubView === 'wifi') {
      return (
        <>
          <OfflineBanner
            isOnline={isOnline}
            pendingCount={pendingCount}
            syncing={syncing}
            locale={locale}
          />
          <HubCard title={t['wifi_title'] ?? ''} onBack={() => setHubView('main')} locale={locale}>
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <DoradoLogo size="sm" />
                <div>
                  <h3 className="font-serif text-3xl tracking-tight">{t['wifi_connect_title']}</h3>
                  <p className="text-sm text-[#FAF7F0]/60 mt-1">{t['wifi_connect_subtitle']}</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
                  <Wifi className="h-7 w-7 text-[#D4AF37]" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl bg-[#1C1C24] border border-[#2a2a33] px-4 py-3">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-[#D4AF37]/80 font-semibold">
                    {t['wifi_network_label']}
                  </p>
                  <p className="text-lg font-bold mt-1 text-[#FAF7F0] select-all">
                    {t['wifi_name']}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#1C1C24] border border-[#2a2a33] px-4 py-3">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-[#D4AF37]/80 font-semibold">
                    {t['wifi_password_label']}
                  </p>
                  <p className="text-lg font-bold mt-1 font-mono tracking-wide text-[#FAF7F0] select-all">
                    {t['wifi_pass']}
                  </p>
                </div>
              </div>
            </div>
          </HubCard>
        </>
      );
    }
    if (hubView === 'benefits') {
      return (
        <>
          <OfflineBanner
            isOnline={isOnline}
            pendingCount={pendingCount}
            syncing={syncing}
            locale={locale}
          />
          <HubCard
            title={t['benefits_title'] ?? ''}
            onBack={() => setHubView('main')}
            locale={locale}
          >
            <div className="space-y-5">
              <p className="text-sm text-[#FAF7F0]/70 leading-relaxed">{t['benefits_text']}</p>
              <a
                href="https://www.americanexpress.com/es-co/network/beneficios/ofertas/?inav=co_menu_offers"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-2xl font-semibold text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_28px_-6px_rgba(212,175,55,0.7)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {t['benefits_cta']}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </HubCard>
        </>
      );
    }
    if (hubView === 'experience') {
      return (
        <>
          <OfflineBanner
            isOnline={isOnline}
            pendingCount={pendingCount}
            syncing={syncing}
            locale={locale}
          />
          <HubCard
            title={t['experience_title'] ?? ''}
            onBack={() => setHubView('main')}
            locale={locale}
          >
            <p className="text-sm text-[#FAF7F0]/70 leading-relaxed">{t['experience_text']}</p>
          </HubCard>
        </>
      );
    }

    return (
      <>
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          syncing={syncing}
          locale={locale}
        />
        <div className="min-h-[100dvh] flex flex-col bg-[#0B0B0F] text-[#FAF7F0]">
          {/* Header */}
          <div className="relative px-6 pt-10 pb-8 text-center bg-gradient-to-b from-[#1C1C24] to-[#0B0B0F] border-b border-[#2a2a33] overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-[#D4AF37]/10 blur-3xl" />
            <div className="relative flex flex-col items-center gap-4">
              <DoradoLogo size="md" />
              <div>
                <h1 className="font-serif text-2xl tracking-tight">{t['welcome']}</h1>
                <p className="text-[#D4AF37] text-[10px] tracking-[0.3em] uppercase mt-2 font-semibold">
                  {mesa.mesaNumero} · {mesa.zona}
                </p>
              </div>
            </div>
          </div>

          {/* Opciones */}
          <div className="flex-1 px-5 py-6 space-y-3">
            <HubButton
              icon={<UtensilsCrossed className="h-5 w-5" />}
              label={t['hub_menu'] ?? ''}
              primary
              onClick={() => setStep('comensales')}
            />
            <HubButton
              icon={<Wifi className="h-5 w-5" />}
              label={t['hub_wifi'] ?? ''}
              onClick={() => setHubView('wifi')}
            />
            <HubButton
              icon={<Star className="h-5 w-5" />}
              label={t['hub_benefits'] ?? ''}
              onClick={() => setHubView('benefits')}
            />
            <HubButton
              icon={<Users className="h-5 w-5" />}
              label={t['hub_experience'] ?? ''}
              onClick={() => setHubView('experience')}
            />
          </div>

          <p className="pb-6 text-center text-[9px] text-[#FAF7F0]/30 tracking-[0.2em] uppercase">
            {t['cardholderLegal']}
          </p>
        </div>
      </>
    );
  }

  // ── Comensales ───────────────────────────────────────────────────────────
  if (step === 'comensales') {
    const n = parseInt(guestInput, 10);
    const valid = n >= 1 && n <= 20;
    return (
      <>
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          syncing={syncing}
          locale={locale}
        />
        <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 gap-8 bg-[#0B0B0F] text-[#FAF7F0] relative overflow-hidden">
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-[#D4AF37]/8 blur-3xl" />
          <div className="relative text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center">
              <Users className="h-8 w-8 text-[#D4AF37]" />
            </div>
            <h2 className="font-serif text-2xl">{t['howManyGuests']}</h2>
          </div>
          <div className="relative w-full max-w-xs space-y-4">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              placeholder={t['guestsPlaceholder']}
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && handleGuestsConfirm()}
              className="w-full text-center text-2xl font-bold bg-[#1C1C24] border-2 border-[#2a2a33] text-[#FAF7F0] placeholder:text-[#FAF7F0]/30 rounded-2xl px-4 py-4 focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
            <button
              className="w-full h-12 rounded-2xl font-semibold text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] hover:shadow-[0_0_28px_-6px_rgba(212,175,55,0.7)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:shadow-none flex items-center justify-center gap-1.5"
              disabled={!valid}
              onClick={handleGuestsConfirm}
            >
              {t['continueCta']}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              className="w-full text-sm text-[#FAF7F0]/50 hover:text-[#FAF7F0] transition-colors py-2"
              onClick={() => setStep('hub')}
            >
              {t['back']}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Menú por comensal ────────────────────────────────────────────────────
  if (step === 'menu') {
    return (
      <>
        <OfflineBanner
          isOnline={isOnline}
          pendingCount={pendingCount}
          syncing={syncing}
          locale={locale}
        />
        <MenuScreen
          key={currentComensal}
          recetas={recetas}
          locale={locale}
          currentComensal={currentComensal}
          totalComensales={totalComensales}
          onConfirm={handleConfirmOrder}
          loading={loading}
          error={orderError}
        />
        {TURNSTILE_ENABLED ? (
          <div className="fixed bottom-2 right-2 z-50">
            <TurnstileWidget
              onVerify={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              resetKey={turnstileResetKey}
            />
          </div>
        ) : null}
      </>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  return (
    <>
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        syncing={syncing}
        locale={locale}
      />
      <div className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12 bg-[#0B0B0F] text-[#FAF7F0] relative overflow-hidden">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#D4AF37]/12 blur-3xl" />
        <div className="relative">
          <DoradoLogo size="md" />
        </div>
        <div className="relative text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 flex items-center justify-center shadow-[0_0_40px_-8px_rgba(212,175,55,0.5)]">
            <CheckCircle2 className="h-12 w-12 text-[#D4AF37]" />
          </div>
          <h2 className="font-serif text-3xl">{t['allDone']}</h2>
          <p className="text-[#FAF7F0]/70 text-sm max-w-xs mx-auto leading-relaxed">
            {t['enjoyMessage']}
          </p>
          <button
            className="mt-4 text-[#D4AF37] text-sm font-medium underline underline-offset-4 hover:text-[#E8C76A] transition-colors"
            onClick={() => {
              setStep('welcome');
              setGuestInput('');
              setCurrentComensal(1);
              setOrderError('');
            }}
          >
            {t['newSession']}
          </button>
        </div>
        <p className="relative text-center text-[9px] text-[#FAF7F0]/30 tracking-[0.2em] uppercase">
          {t['cardholderLegal']}
        </p>
      </div>
    </>
  );
}

// ─── Sub-componentes helper ───────────────────────────────────────────────────
function HubButton({
  icon,
  label,
  primary = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl font-semibold text-left transition-all active:scale-[0.98] ${
        primary
          ? 'text-[#0B0B0F] bg-gradient-to-r from-[#D4AF37] to-[#E8C76A] shadow-[0_0_24px_-6px_rgba(212,175,55,0.55)]'
          : 'bg-[#1C1C24] border border-[#2a2a33] text-[#FAF7F0] hover:border-[#D4AF37]/40'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={primary ? 'text-[#0B0B0F]' : 'text-[#D4AF37]'}>{icon}</span>
        {label}
      </span>
      <ChevronRight className={`h-4 w-4 ${primary ? 'opacity-70' : 'opacity-40'}`} />
    </button>
  );
}

function HubCard({
  title,
  children,
  onBack,
  locale,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  locale: string;
}) {
  const t = TEXTS[locale] ?? TEXTS['es']!;
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0B0B0F] text-[#FAF7F0]">
      <div className="px-5 py-4 border-b border-[#2a2a33] flex items-center gap-3 bg-[#1C1C24]/40">
        <button
          onClick={onBack}
          className="text-sm text-[#D4AF37] hover:text-[#E8C76A] transition-colors font-medium"
        >
          ← {t['back']}
        </button>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-6">{children}</div>
    </div>
  );
}
