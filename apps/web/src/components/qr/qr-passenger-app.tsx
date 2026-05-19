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
    byAmex: 'Dorado Lounge, by Amex',
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
    wifi_name: 'Dorado-Lounge',
    wifi_pass: 'Consulta contraseña con el personal',
    benefits_title: 'Beneficios American Express',
    benefits_text:
      'Como titular de American Express disfruta de acceso prioritario, menú exclusivo y atención preferencial en el Dorado Lounge.',
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
    byAmex: 'Dorado Lounge, by Amex',
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
    wifi_name: 'Dorado-Lounge',
    wifi_pass: 'Ask staff for password',
    benefits_title: 'American Express Benefits',
    benefits_text:
      'As an American Express cardholder, enjoy priority access, exclusive menu and preferred service at Dorado Lounge.',
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
    byAmex: 'Dorado Lounge, by Amex',
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
    wifi_name: 'Dorado-Lounge',
    wifi_pass: 'Demandez le mot de passe au personnel',
    benefits_title: 'Avantages American Express',
    benefits_text:
      "En tant que titulaire American Express, profitez d'un accès prioritaire, d'un menu exclusif et d'un service préférentiel.",
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
    byAmex: 'Dorado Lounge, by Amex',
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
    wifi_name: 'Dorado-Lounge',
    wifi_pass: 'Peça a senha ao pessoal',
    benefits_title: 'Benefícios American Express',
    benefits_text:
      'Como titular American Express, aproveite acesso prioritário, menu exclusivo e atendimento preferencial no Dorado Lounge.',
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

// ─── Logo Amex ────────────────────────────────────────────────────────────────
function AmexLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        className="rounded-xl px-6 py-3 flex flex-col items-center gap-0"
        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}
      >
        <span className="text-white text-[9px] font-bold tracking-[0.25em] uppercase opacity-80">
          American
        </span>
        <span className="text-white text-xl font-black tracking-[0.1em] leading-tight">
          EXPRESS
        </span>
      </div>
    </div>
  );
}

// ─── Componente plato expandible ──────────────────────────────────────────────
function DishCard({
  receta,
  locale,
  onAdd,
}: {
  receta: PublicReceta;
  locale: string;
  onAdd: (item: CartItem) => void;
}) {
  const t = TEXTS[locale] ?? TEXTS['es']!;
  const [expanded, setExpanded] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [notas, setNotas] = useState('');
  const [added, setAdded] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const handleAdd = () => {
    onAdd({ receta, notas });
    setAdded(true);
    setNotas('');
    setExpanded(false);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div
      className={`border rounded-2xl overflow-hidden transition-all ${
        expanded ? 'border-blue-400 shadow-md' : 'border-border'
      }`}
    >
      {/* Fila principal — siempre visible */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-card hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-snug">{receta.nombre}</p>
          {receta.descripcion && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {receta.descripcion}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {added && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
              ✓ {t['added']}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-card border-t border-border space-y-3">
          {/* Imagen del plato */}
          {receta.imagenUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receta.imagenUrl}
              alt={receta.nombre}
              className="w-full h-48 rounded-xl object-cover"
            />
          ) : (
            <div className="w-full h-40 rounded-xl bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 dark:from-zinc-800 dark:to-zinc-700 flex flex-col items-center justify-center gap-2">
              <UtensilsCrossed className="h-12 w-12 text-amber-300 dark:text-amber-600" />
              <span className="text-xs text-amber-400 dark:text-amber-600 font-medium tracking-wide uppercase">
                Dorado Lounge
              </span>
            </div>
          )}

          {/* Ingredientes */}
          {receta.ingredientes.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400"
                onClick={() => setShowIngredients((v) => !v)}
              >
                {showIngredients ? t['hideIngredients'] : t['viewIngredients']}
                {showIngredients ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {showIngredients && (
                <ul className="mt-1.5 space-y-0.5 pl-2">
                  {receta.ingredientes.map((ing, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-blue-400">·</span>
                      {ing.nombre}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Nota */}
          <textarea
            rows={2}
            placeholder={t['notePlaceholder']}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="w-full text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />

          {/* Botón agregar */}
          <Button className="w-full" style={{ background: '#016FD0' }} onClick={handleAdd}>
            {t['addDish']}
          </Button>
        </div>
      )}
    </div>
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

  const addItem = (item: CartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.receta.id === item.receta.id);
      if (idx >= 0) return prev.map((c, i) => (i === idx ? item : c));
      return [...prev, item];
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-bold text-sm" style={{ color: '#016FD0' }}>
              {t['guestLabel']} {currentComensal} {t['of']} {totalComensales}
            </p>
          </div>
          {cart.length > 0 && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full px-2.5 py-0.5 font-medium">
              {cart.length} {cart.length === 1 ? t['dishSingular'] : t['dishPlural']}
            </span>
          )}
        </div>
        {/* Tabs de categoría */}
        {availableCategories.length > 0 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  activeCategory === cat
                    ? 'text-white border-transparent'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                style={
                  activeCategory === cat ? { background: '#016FD0', borderColor: '#016FD0' } : {}
                }
              >
                {t[`categories_${cat}`]}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Lista de platos */}
      <main className="flex-1 px-4 py-4 space-y-2">
        {(byCategory[activeCategory] ?? []).length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
            <UtensilsCrossed className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t['noDishesAvailable']}</p>
          </div>
        ) : (
          (byCategory[activeCategory] ?? []).map((receta) => (
            <DishCard key={receta.id} receta={receta} locale={locale} onAdd={addItem} />
          ))
        )}
      </main>

      {error && <p className="px-4 pb-2 text-sm text-destructive text-center">{error}</p>}

      {/* CTA fijo */}
      <div className="sticky bottom-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t px-4 py-3 safe-pb space-y-2">
        {emptyWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center font-medium">
            {t['selectAtLeastOne']}
          </p>
        )}
        <Button
          className="w-full text-white font-semibold"
          style={{ background: '#016FD0' }}
          size="lg"
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
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t['sending']}
            </>
          ) : (
            <>
              {t['confirmOrder']}
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
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
        <div
          className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12"
          style={{ background: '#016FD0' }}
        >
          {/* Logo top */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/60 text-[9px] font-bold tracking-[0.25em] uppercase">
              American
            </span>
            <span className="text-white text-3xl font-black tracking-[0.08em]">EXPRESS</span>
          </div>

          <div className="w-full space-y-6 text-center">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">{t['byAmex']}</h1>
              <p className="text-white/70 text-sm mt-1">{t['selectLanguage']}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => handleLocaleSelect(l.code)}
                  className={`py-4 rounded-2xl font-semibold text-base transition-all ${
                    locale === l.code
                      ? 'bg-white text-[#016FD0] shadow-lg'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logo bottom */}
          <div className="flex flex-col items-center gap-1 opacity-60">
            <span className="text-white text-[9px] font-bold tracking-[0.25em] uppercase">
              American
            </span>
            <span className="text-white text-lg font-black tracking-[0.1em]">EXPRESS</span>
          </div>
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
            <div className="space-y-4 text-center">
              <Wifi className="h-12 w-12 mx-auto" style={{ color: '#016FD0' }} />
              <div>
                <p className="font-bold text-lg">{t['wifi_name']}</p>
                <p className="text-sm text-muted-foreground mt-1">{t['wifi_pass']}</p>
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
            <p className="text-sm text-muted-foreground leading-relaxed">{t['benefits_text']}</p>
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
            <p className="text-sm text-muted-foreground leading-relaxed">{t['experience_text']}</p>
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
        <div className="min-h-[100dvh] flex flex-col bg-background">
          {/* Header */}
          <div className="px-6 pt-10 pb-6 text-center" style={{ background: '#016FD0' }}>
            <AmexLogo className="mb-4" />
            <h1 className="text-2xl font-black text-white">{t['welcome']}</h1>
            <p className="text-white/80 text-sm mt-1">
              {mesa.mesaNumero} · {mesa.zona.toUpperCase()}
            </p>
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

          <div className="pb-8 flex justify-center">
            <AmexLogo />
          </div>
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
        <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 gap-8">
          <div className="text-center space-y-2">
            <Users className="h-12 w-12 mx-auto" style={{ color: '#016FD0' }} />
            <h2 className="text-xl font-bold">{t['howManyGuests']}</h2>
          </div>
          <div className="w-full max-w-xs space-y-4">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              placeholder={t['guestsPlaceholder']}
              value={guestInput}
              onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && handleGuestsConfirm()}
              className="w-full text-center text-2xl font-bold border-2 border-border rounded-2xl px-4 py-4 bg-background focus:outline-none focus:border-blue-400"
              style={{ '--tw-ring-color': '#016FD0' } as React.CSSProperties}
            />
            <Button
              className="w-full font-semibold text-white"
              style={{ background: '#016FD0' }}
              size="lg"
              disabled={!valid}
              onClick={handleGuestsConfirm}
            >
              {t['continueCta']}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
            <button
              className="w-full text-sm text-muted-foreground py-2"
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
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-between px-6 py-12"
        style={{ background: '#016FD0' }}
      >
        <AmexLogo />
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-20 w-20 mx-auto text-white" />
          <h2 className="text-2xl font-black text-white">{t['allDone']}</h2>
          <p className="text-white/80 text-sm max-w-xs mx-auto">{t['enjoyMessage']}</p>
          <button
            className="mt-4 text-white/60 text-sm underline underline-offset-4"
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
        <AmexLogo />
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
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl font-semibold text-left transition-all ${
        primary
          ? 'text-white shadow-md'
          : 'bg-card border border-border text-foreground hover:bg-accent'
      }`}
      style={primary ? { background: '#016FD0' } : {}}
    >
      <span className="flex items-center gap-3">
        {icon}
        {label}
      </span>
      <ChevronRight className="h-4 w-4 opacity-60" />
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
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <div className="px-5 py-4 border-b flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← {t['back']}
        </button>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      <div className="flex-1 px-5 py-6">{children}</div>
    </div>
  );
}
