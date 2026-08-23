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
  ChevronLeft,
  ExternalLink,
  Clock,
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
    categories_postre: 'Postres',
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
    wifi_name: '',
    wifi_pass: '',
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
    reviewOrder: 'Revisar pedido',
    yourOrder: 'Tu pedido',
    estimatedTime: 'Tiempo estimado',
    totalEstimated: 'Tiempo total estimado',
    min: 'min',
    editOrder: 'Editar pedido',
    sendOrder: 'Enviar pedido',
    orderSentTitle: '¡Pedido enviado!',
    preparingMsg: 'Tu pedido está siendo preparado',
    nextGuestMsg: 'Siguiente comensal en un momento…',
    noNotes: 'Sin notas',
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
    categories_postre: 'Desserts',
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
    wifi_name: '',
    wifi_pass: '',
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
    reviewOrder: 'Review order',
    yourOrder: 'Your order',
    estimatedTime: 'Estimated time',
    totalEstimated: 'Total estimated time',
    min: 'min',
    editOrder: 'Edit order',
    sendOrder: 'Send order',
    orderSentTitle: 'Order sent!',
    preparingMsg: 'Your order is being prepared',
    nextGuestMsg: 'Next guest in a moment…',
    noNotes: 'No notes',
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
    categories_postre: 'Desserts',
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
    wifi_name: '',
    wifi_pass: '',
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
    reviewOrder: 'Vérifier la commande',
    yourOrder: 'Votre commande',
    estimatedTime: 'Temps estimé',
    totalEstimated: 'Temps total estimé',
    min: 'min',
    editOrder: 'Modifier',
    sendOrder: 'Envoyer la commande',
    orderSentTitle: 'Commande envoyée !',
    preparingMsg: 'Votre commande est en préparation',
    nextGuestMsg: 'Prochain convive dans un moment…',
    noNotes: 'Pas de notes',
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
    categories_postre: 'Sobremesas',
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
    wifi_name: '',
    wifi_pass: '',
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
    reviewOrder: 'Revisar pedido',
    yourOrder: 'Seu pedido',
    estimatedTime: 'Tempo estimado',
    totalEstimated: 'Tempo total estimado',
    min: 'min',
    editOrder: 'Editar pedido',
    sendOrder: 'Enviar pedido',
    orderSentTitle: 'Pedido enviado!',
    preparingMsg: 'Seu pedido está sendo preparado',
    nextGuestMsg: 'Próximo comensal em um momento…',
    noNotes: 'Sem notas',
  },
};

const CATEGORY_ORDER: CategoriaMenu[] = ['entrada', 'plato_fuerte', 'acompanante', 'postre'];

const ESTIMATED_MINUTES: Record<CategoriaMenu, number> = {
  entrada: 10,
  plato_fuerte: 20,
  acompanante: 8,
  postre: 10,
};

const LOCALES = [
  { code: 'es', label: 'Español', flag: '🇪🇸', sub: 'Spanish' },
  { code: 'en', label: 'English', flag: '🇺🇸', sub: 'Inglés' },
  { code: 'pt', label: 'Português', flag: '🇧🇷', sub: 'Portuguese' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', sub: 'French' },
];

// ─── Wordmark Dorado Lounge — identidad propia, sin trade dress AmEx ─────────
function DoradoLogo({
  size = 'md',
  variant = 'dark',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'dark' | 'light';
  className?: string;
}) {
  const sizes = {
    sm: { title: 'text-xl', sub: 'text-[8px]', gap: 'gap-1.5', rule: 'w-8' },
    md: { title: 'text-3xl', sub: 'text-[10px]', gap: 'gap-2', rule: 'w-10' },
    lg: { title: 'text-5xl', sub: 'text-caption', gap: 'gap-3', rule: 'w-14' },
  } as const;
  const s = sizes[size];
  const titleColor = variant === 'light' ? 'text-[#00175A]' : 'text-[#FAF7F0]';
  return (
    <div className={`flex flex-col items-center ${s.gap} ${className}`}>
      <span
        className={`font-serif ${s.title} font-medium tracking-[0.18em] ${titleColor} leading-none`}
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

  const animDelay = Math.min(index * 70, 350);
  const estimatedMin =
    (receta.categoriaMenu ? ESTIMATED_MINUTES[receta.categoriaMenu] : undefined) ?? 15;

  return (
    <article
      className={`rounded-xl overflow-hidden border bg-white cursor-pointer select-none transition-all duration-300 active:scale-[0.99] ${
        selected
          ? 'border-[#016FD0] shadow-[0_0_16px_-4px_rgba(1,111,208,0.3)]'
          : expanded
            ? 'border-[#016FD0]/40 shadow-[0_2px_16px_-4px_rgba(1,111,208,0.15)]'
            : 'border-[#D6DEE8] hover:border-[#016FD0]/30 shadow-sm'
      }`}
      style={{ animation: `dishFadeIn 0.45s var(--ease-expresivo) ${animDelay}ms both` }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Compact header — siempre visible */}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-[#E3EDF8]">
          {receta.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receta.imagenUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UtensilsCrossed className="h-4 w-4 text-[#016FD0]/30" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#00175A] text-[13px] font-bold leading-tight truncate">
            {receta.nombre}
          </h3>
          {receta.descripcion && (
            <p className="text-[#00175A]/45 text-[11px] mt-0.5 line-clamp-1">
              {receta.descripcion}
            </p>
          )}
          <p className="text-[10px] text-[#016FD0]/50 mt-0.5 flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" /> ~{estimatedMin} {t['min']}
          </p>
        </div>
        <button
          onClick={handleAdd}
          className={`shrink-0 h-7 px-2.5 rounded-full font-semibold text-[10px] transition-all active:scale-90 ${
            selected
              ? 'bg-white border border-[#016FD0]/50 text-[#016FD0]'
              : 'text-white bg-[#016FD0] hover:bg-[#0157A6]'
          }`}
        >
          {selected ? (
            <span
              className={`flex items-center gap-1 transition-transform duration-300 ${pulseBadge ? 'scale-110' : 'scale-100'}`}
            >
              <CheckCircle2 className="h-3 w-3" />
            </span>
          ) : (
            '+'
          )}
        </button>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#016FD0]/40 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Detalle expandible */}
      <div
        className="grid transition-[grid-template-rows] duration-400 ease-expresivo"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#D6DEE8]">
            {/* Foto grande */}
            {receta.imagenUrl && (
              <div className="w-full aspect-[16/7] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receta.imagenUrl}
                  alt={receta.nombre}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="px-3 pb-3 pt-2 space-y-2">
              {receta.descripcion && (
                <p className="text-[12px] text-[#00175A]/55 leading-relaxed">
                  {receta.descripcion}
                </p>
              )}
              {receta.ingredientes.length > 0 && (
                <div>
                  <p className="text-[10px] tracking-[0.15em] uppercase text-[#016FD0]/60 font-semibold mb-1">
                    {t['viewIngredients']}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {receta.ingredientes.map((ing, i) => (
                      <span
                        key={`${receta.id}-${ing.nombre}`}
                        className="text-[10px] text-[#00175A]/65 bg-[#F0F5FB] border border-[#D6DEE8] rounded-full px-2 py-0.5"
                        style={{
                          animation: expanded
                            ? `dishFadeIn 0.3s ease-out ${i * 25}ms both`
                            : 'none',
                        }}
                      >
                        {ing.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                rows={1}
                placeholder={t['notePlaceholder']}
                value={notas}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full text-[12px] bg-[#F0F5FB] border border-[#D6DEE8] text-[#00175A] placeholder:text-[#00175A]/30 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#016FD0] focus:ring-1 focus:ring-[#016FD0]/20 resize-none transition-colors"
              />
              <button
                onClick={handleAdd}
                className="w-full h-9 rounded-full font-semibold text-[13px] text-white bg-[#016FD0] hover:bg-[#0157A6] active:scale-[0.97] transition-all"
              >
                {selected ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> {t['added']}
                  </span>
                ) : (
                  t['addDish']
                )}
              </button>
            </div>
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
  sent,
}: {
  recetas: PublicReceta[];
  locale: string;
  currentComensal: number;
  totalComensales: number;
  onConfirm: (items: CartItem[]) => void;
  loading: boolean;
  error: string;
  sent?: boolean | undefined;
}) {
  const t = TEXTS[locale] ?? TEXTS['es']!;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showReview, setShowReview] = useState(false);
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
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-[#D6DEE8] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase font-bold text-[#016FD0]">
              {t['guestLabel']} {currentComensal} {t['of']} {totalComensales}
            </p>
          </div>
          {totalItems > 0 && (
            <span className="text-caption bg-[#016FD0] text-white rounded-full px-3 py-1 font-bold tabular-nums shadow-[0_2px_8px_-2px_rgba(1,111,208,0.4)]">
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
                  className={`shrink-0 text-caption font-semibold px-4 py-2 rounded-full border transition-all active:scale-95 ${
                    active
                      ? 'bg-[#016FD0] text-white border-[#016FD0] shadow-[0_2px_12px_-4px_rgba(1,111,208,0.4)]'
                      : 'border-[#D6DEE8] text-[#00175A]/55 hover:text-[#016FD0] hover:border-[#016FD0]/40'
                  }`}
                >
                  {t[`categories_${cat}`]}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Lista de platos */}
      <main key={activeCategory} className="flex-1 px-4 py-4 space-y-2.5">
        {(byCategory[activeCategory] ?? []).length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-[#00175A]/35">
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

      {error && <p className="px-4 pb-2 text-sm text-red-600 text-center">{error}</p>}

      {/* CTA fijo — abre review */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-[#D6DEE8] px-4 py-3 safe-pb space-y-2">
        {emptyWarning && (
          <p className="text-caption text-[#016FD0] text-center font-medium">
            {t['selectAtLeastOne']}
          </p>
        )}
        <button
          className="w-full h-12 rounded-full font-bold text-white bg-[#016FD0] hover:bg-[#0157A6] hover:shadow-[0_4px_20px_-4px_rgba(1,111,208,0.45)] active:scale-[0.98] transition-all disabled:opacity-50"
          onClick={() => {
            if (cart.length === 0) {
              setEmptyWarning(true);
              if (emptyWarningTimerRef.current) clearTimeout(emptyWarningTimerRef.current);
              emptyWarningTimerRef.current = setTimeout(() => setEmptyWarning(false), 3000);
              return;
            }
            setEmptyWarning(false);
            setShowReview(true);
          }}
          disabled={loading}
        >
          <span className="flex items-center justify-center gap-1.5">
            {t['reviewOrder']} ({totalItems})
            <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </div>

      {/* ── Review overlay ── */}
      {showReview && !sent && (
        <div
          className="fixed inset-0 z-50 bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A] flex flex-col"
          style={{ animation: 'reviewSlideUp 0.4s var(--ease-expresivo) both' }}
        >
          <div className="px-4 py-3 border-b border-[#D6DEE8] flex items-center gap-3 bg-white/80 backdrop-blur-sm">
            <button
              onClick={() => setShowReview(false)}
              className="text-[#016FD0] hover:text-[#0157A6] transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="font-bold text-base flex-1">{t['yourOrder']}</h2>
            <span className="text-caption text-[#016FD0] font-semibold">
              {t['guestLabel']} {currentComensal}/{totalComensales}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
            {cart.map((item, i) => {
              const mins =
                (item.receta.categoriaMenu
                  ? ESTIMATED_MINUTES[item.receta.categoriaMenu]
                  : undefined) ?? 15;
              return (
                <div
                  key={item.receta.id}
                  className="bg-white rounded-xl border border-[#D6DEE8] p-3 shadow-sm flex gap-3"
                  style={{ animation: `dishFadeIn 0.35s ease-out ${i * 80}ms both` }}
                >
                  <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-[#E3EDF8]">
                    {item.receta.imagenUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.receta.imagenUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UtensilsCrossed className="h-5 w-5 text-[#016FD0]/25" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[13px] text-[#00175A] truncate">
                      {item.receta.nombre}
                    </p>
                    <p className="text-[11px] text-[#00175A]/45 mt-0.5">
                      {item.notas || t['noNotes']}
                    </p>
                    <p className="text-[11px] text-[#016FD0]/60 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> ~{mins} {t['min']}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tiempo total + confirmar */}
          <div className="border-t border-[#D6DEE8] bg-white/80 backdrop-blur-sm px-4 py-3 safe-pb space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#00175A]/60 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#016FD0]" />
                {t['totalEstimated']}
              </span>
              <span className="font-bold text-[#016FD0]">
                ~
                {Math.max(
                  ...cart.map(
                    (c) =>
                      (c.receta.categoriaMenu
                        ? ESTIMATED_MINUTES[c.receta.categoriaMenu]
                        : undefined) ?? 15,
                  ),
                )}{' '}
                {t['min']}
              </span>
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button
              className="w-full h-12 rounded-full font-bold text-white bg-[#016FD0] hover:bg-[#0157A6] hover:shadow-[0_4px_20px_-4px_rgba(1,111,208,0.45)] active:scale-[0.98] transition-all disabled:opacity-50"
              onClick={() => onConfirm(cart)}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t['sending']}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  {t['sendOrder']}
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Sent animation overlay ── */}
      {sent && (
        <div
          className="fixed inset-0 z-50 bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] flex flex-col items-center justify-center text-center px-6"
          style={{ animation: 'reviewSlideUp 0.3s ease-out both' }}
        >
          <div style={{ animation: 'sentPulse 0.6s var(--ease-expresivo) both' }}>
            <div className="w-20 h-20 mx-auto rounded-full bg-[#016FD0]/10 border-2 border-[#016FD0]/30 flex items-center justify-center mb-4">
              <CheckCircle2
                className="h-10 w-10 text-[#016FD0]"
                style={{ animation: 'sentCheck 0.5s ease-out 0.2s both' }}
              />
            </div>
            <h2 className="font-serif text-2xl text-[#00175A] mb-2">{t['orderSentTitle']}</h2>
            <p className="text-sm text-[#00175A]/55 mb-1">{t['preparingMsg']}</p>
            <p className="text-caption text-[#016FD0] font-semibold flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />~
              {Math.max(
                ...cart.map(
                  (c) =>
                    (c.receta.categoriaMenu
                      ? ESTIMATED_MINUTES[c.receta.categoriaMenu]
                      : undefined) ?? 15,
                ),
              )}{' '}
              {t['min']}
            </p>
            {currentComensal < totalComensales && (
              <p className="mt-4 text-caption text-[#00175A]/40">{t['nextGuestMsg']}</p>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes reviewSlideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sentPulse {
          0%   { opacity: 0; transform: scale(0.8); }
          60%  { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sentCheck {
          from { opacity: 0; transform: scale(0) rotate(-45deg); }
          to   { opacity: 1; transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

// ─── App principal ────────────────────────────────────────────────────────────
interface WifiConfig {
  networkName: string;
  password: string;
}

interface QRPassengerAppProps {
  recetas: PublicReceta[];
  mesa: MesaInfo;
  token: string;
  initialLocale: string;
  wifiConfig: WifiConfig;
}

export function QRPassengerApp({
  recetas,
  mesa,
  token,
  initialLocale,
  wifiConfig,
}: QRPassengerAppProps) {
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
  const [orderSent, setOrderSent] = useState(false);
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
    setOrderSent(true);
    await new Promise((r) => setTimeout(r, 2000));
    setOrderSent(false);

    if (currentComensal < totalComensales) {
      setCurrentComensal((n) => n + 1);
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
        <div className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12 bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A] relative overflow-hidden">
          {/* Halos azules decorativos */}
          <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] rounded-full bg-[#016FD0]/8 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[#016FD0]/5 blur-3xl" />

          {/* Logo top */}
          <div
            className="relative"
            style={{ animation: 'langFadeDown 0.8s var(--ease-expresivo) both' }}
          >
            <DoradoLogo size="lg" variant="light" />
          </div>

          <div className="relative w-full space-y-7 text-center">
            <div
              className="space-y-2"
              style={{ animation: 'langFadeDown 0.7s var(--ease-expresivo) 0.15s both' }}
            >
              <h1 className="font-serif text-xl tracking-[0.18em] uppercase text-[#00175A]/90">
                {t['tagline']}
              </h1>
              <p className="text-[#00175A]/50 text-sm">{t['selectLanguage']}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOCALES.map((l, i) => (
                <button
                  key={l.code}
                  onClick={() => handleLocaleSelect(l.code)}
                  className="group relative flex flex-col items-center gap-2.5 py-5 px-3 rounded-3xl border bg-white border-[#D6DEE8] text-[#00175A] shadow-[0_2px_12px_-4px_rgba(0,23,90,0.08)] transition-all duration-300 hover:border-[#016FD0]/60 hover:shadow-[0_4px_24px_-6px_rgba(1,111,208,0.25)] active:scale-[0.95]"
                  style={{
                    animation: `langCardIn 0.6s var(--ease-expresivo) ${300 + i * 100}ms both`,
                  }}
                >
                  <span
                    className="text-4xl transition-transform duration-300 group-hover:scale-110 group-active:scale-95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
                    style={{ filter: 'saturate(1.1)' }}
                  >
                    {l.flag}
                  </span>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-semibold text-[15px] tracking-wide transition-colors duration-300 group-hover:text-[#016FD0]">
                      {l.label}
                    </span>
                    <span className="text-[10px] text-[#00175A]/40 tracking-wider uppercase">
                      {l.sub}
                    </span>
                  </div>
                  {/* Borde azul AMEX animado al hover */}
                  <span className="absolute inset-0 rounded-3xl border-2 border-[#016FD0] opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
                </button>
              ))}
            </div>
          </div>

          {/* Línea legal */}
          <p
            className="relative text-[10px] text-[#00175A]/35 tracking-[0.15em] uppercase text-center max-w-xs"
            style={{ animation: 'langFadeDown 0.6s var(--ease-expresivo) 0.8s both' }}
          >
            {t['cardholderLegal']}
          </p>
        </div>

        {/* Animaciones de entrada */}
        <style>{`
          @keyframes langCardIn {
            from { opacity: 0; transform: translateY(24px) scale(0.92); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes langFadeDown {
            from { opacity: 0; transform: translateY(-12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
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
                <DoradoLogo size="sm" variant="light" />
                <div>
                  <h3 className="font-serif text-3xl tracking-tight text-[#00175A]">
                    {t['wifi_connect_title']}
                  </h3>
                  <p className="text-sm text-[#00175A]/50 mt-1">{t['wifi_connect_subtitle']}</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-[#016FD0]/10 border border-[#016FD0]/25 flex items-center justify-center">
                  <Wifi className="h-7 w-7 text-[#016FD0]" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl bg-white border border-[#D6DEE8] px-4 py-3 shadow-sm">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-[#016FD0]/80 font-semibold">
                    {t['wifi_network_label']}
                  </p>
                  <p className="text-lg font-bold mt-1 text-[#00175A] select-all">
                    {wifiConfig.networkName}
                  </p>
                </div>
                <div className="rounded-2xl bg-white border border-[#D6DEE8] px-4 py-3 shadow-sm">
                  <p className="text-[10px] tracking-[0.25em] uppercase text-[#016FD0]/80 font-semibold">
                    {t['wifi_password_label']}
                  </p>
                  <p className="text-lg font-bold mt-1 font-mono tracking-wide text-[#00175A] select-all">
                    {wifiConfig.password}
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
              <p className="text-sm text-[#00175A]/65 leading-relaxed">{t['benefits_text']}</p>
              <a
                href="https://www.americanexpress.com/es-co/network/beneficios/ofertas/?inav=co_menu_offers"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-2xl font-semibold text-white bg-[#016FD0] hover:bg-[#0157A6] hover:shadow-[0_4px_20px_-4px_rgba(1,111,208,0.45)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
            <p className="text-sm text-[#00175A]/65 leading-relaxed">{t['experience_text']}</p>
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
        <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A]">
          {/* Header */}
          <div className="relative px-6 pt-10 pb-8 text-center bg-gradient-to-b from-[#016FD0]/5 to-transparent border-b border-[#D6DEE8] overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-[#016FD0]/6 blur-3xl" />
            <div className="relative flex flex-col items-center gap-4">
              <DoradoLogo size="md" variant="light" />
              <div>
                <h1 className="font-serif text-2xl tracking-tight text-[#00175A]">
                  {t['welcome']}
                </h1>
                <p className="text-[#016FD0] text-[10px] tracking-[0.3em] uppercase mt-2 font-semibold">
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

          <p className="pb-6 text-center text-[9px] text-[#00175A]/30 tracking-[0.2em] uppercase">
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
        <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 gap-8 bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A] relative overflow-hidden">
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-[#016FD0]/6 blur-3xl" />
          <div className="relative text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#016FD0]/10 border border-[#016FD0]/25 flex items-center justify-center">
              <Users className="h-8 w-8 text-[#016FD0]" />
            </div>
            <h2 className="font-serif text-2xl text-[#00175A]">{t['howManyGuests']}</h2>
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
              className="w-full text-center text-2xl font-bold bg-white border-2 border-[#D6DEE8] text-[#00175A] placeholder:text-[#00175A]/30 rounded-2xl px-4 py-4 focus:outline-none focus:border-[#016FD0] focus:ring-2 focus:ring-[#016FD0]/20 transition-all shadow-sm"
            />
            <button
              className="w-full h-12 rounded-2xl font-semibold text-white bg-[#016FD0] hover:bg-[#0157A6] hover:shadow-[0_4px_20px_-4px_rgba(1,111,208,0.45)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:shadow-none flex items-center justify-center gap-1.5"
              disabled={!valid}
              onClick={handleGuestsConfirm}
            >
              {t['continueCta']}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              className="w-full text-sm text-[#00175A]/50 hover:text-[#016FD0] transition-colors py-2"
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
          sent={orderSent}
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
      <div className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12 bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A] relative overflow-hidden">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#016FD0]/8 blur-3xl" />
        <div className="relative">
          <DoradoLogo size="md" variant="light" />
        </div>
        <div className="relative text-center space-y-4">
          <div className="w-24 h-24 mx-auto rounded-full bg-[#016FD0]/10 border border-[#016FD0]/30 flex items-center justify-center shadow-[0_0_40px_-8px_rgba(1,111,208,0.3)]">
            <CheckCircle2 className="h-12 w-12 text-[#016FD0]" />
          </div>
          <h2 className="font-serif text-3xl text-[#00175A]">{t['allDone']}</h2>
          <p className="text-[#00175A]/60 text-sm max-w-xs mx-auto leading-relaxed">
            {t['enjoyMessage']}
          </p>
          <button
            className="mt-4 text-[#016FD0] text-sm font-medium underline underline-offset-4 hover:text-[#0157A6] transition-colors"
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
        <p className="relative text-center text-[9px] text-[#00175A]/30 tracking-[0.2em] uppercase">
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
          ? 'text-white bg-[#016FD0] hover:bg-[#0157A6] shadow-[0_4px_20px_-4px_rgba(1,111,208,0.4)]'
          : 'bg-white border border-[#D6DEE8] text-[#00175A] hover:border-[#016FD0]/50 hover:shadow-[0_2px_16px_-4px_rgba(1,111,208,0.15)] shadow-sm'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={primary ? 'text-white' : 'text-[#016FD0]'}>{icon}</span>
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
    <div className="min-h-[100dvh] flex flex-col bg-gradient-to-b from-white via-[#F0F5FB] to-[#E3EDF8] text-[#00175A]">
      <div className="px-5 py-4 border-b border-[#D6DEE8] flex items-center gap-3 bg-white/60 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="text-sm text-[#016FD0] hover:text-[#0157A6] transition-colors font-medium"
        >
          ← {t['back']}
        </button>
        <h2 className="font-bold text-base text-[#00175A]">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-6">{children}</div>
    </div>
  );
}
