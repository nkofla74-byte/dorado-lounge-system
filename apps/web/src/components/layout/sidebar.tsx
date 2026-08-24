'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Package,
  BookOpen,
  ChefHat,
  ClipboardList,
  Coffee,
  BarChart3,
  DollarSign,
  Building2,
  Clock,
  LogOut,
  Menu,
  MonitorCheck,
  QrCode,
  UserCog,
  Bell,
  Store,
  GitBranch,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { AlertasBell } from '@/components/alertas/alertas-bell';
import { cn } from '@/lib/utils';
import type { UserRole } from '@dorado/shared-types';

interface SidebarUser {
  name: string;
  email: string;
  role: UserRole;
}

interface SidebarProps {
  user: SidebarUser;
  locale: 'es' | 'en';
}

// roles autorizados por ruta — espejo de ROLE_ALLOWED_PREFIXES en lib/auth/role-home.ts.
// Este array controla VISIBILIDAD en la UI, no acceso real (el middleware es la autoridad).
// Al agregar/modificar roles, mantener sincronizado con ROLE_ALLOWED_PREFIXES.
// `labelKey` referencia messages/<locale>.json → nav.<labelKey>
const NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon; roles: UserRole[] }[] = [
  // /almacen es la pantalla dedicada del almacenero. Admin accede a la misma
  // operación de bodega desde la tab "Almacén" del hub /inventario.
  { href: '/almacen', labelKey: 'almacen', icon: Package, roles: ['personal_almacen'] },
  {
    href: '/inventario',
    labelKey: 'inventario',
    icon: Package,
    roles: [
      'admin',
      'chef_cocina_fria',
      'chef_cocina_caliente',
      'sous_chef',
      'personal_almacen',
      'personal_pasteleria',
      'steward',
    ],
  },
  {
    href: '/recetas',
    labelKey: 'recetas',
    icon: BookOpen,
    roles: [
      'admin',
      'chef_cocina_fria',
      'chef_cocina_caliente',
      'sous_chef',
      'personal_pasteleria',
    ],
  },
  {
    href: '/cocina-fria',
    labelKey: 'cocinaFria',
    icon: MonitorCheck,
    roles: ['admin', 'chef_cocina_fria'],
  },
  {
    href: '/cocina-caliente',
    labelKey: 'cocinaCaliente',
    icon: MonitorCheck,
    roles: ['admin', 'chef_cocina_caliente'],
  },
  {
    href: '/cocina-amex',
    labelKey: 'cocinaAmex',
    icon: MonitorCheck,
    roles: ['admin', 'sous_chef'],
  },
  {
    href: '/produccion',
    labelKey: 'produccion',
    icon: ChefHat,
    roles: [
      'admin',
      'chef_cocina_fria',
      'chef_cocina_caliente',
      'sous_chef',
      'personal_pasteleria',
      'steward',
    ],
  },
  {
    href: '/pasteleria',
    labelKey: 'pasteleria',
    icon: Coffee,
    roles: ['admin', 'personal_pasteleria'],
  },
  {
    href: '/pedidos',
    labelKey: 'pedidos',
    icon: ClipboardList,
    roles: ['admin', 'chef_cocina_fria', 'chef_cocina_caliente', 'sous_chef', 'mesero_amex'],
  },
  {
    href: '/snack',
    labelKey: 'snack',
    icon: ClipboardList,
    roles: ['admin', 'personal_snack'],
  },
  {
    href: '/buffet',
    labelKey: 'buffet',
    icon: ClipboardList,
    roles: ['admin', 'personal_buffet'],
  },
  { href: '/admin/qr', labelKey: 'qrGenerator', icon: QrCode, roles: ['admin'] },
  { href: '/analytics', labelKey: 'analytics', icon: BarChart3, roles: ['admin'] },
  { href: '/admin/costos', labelKey: 'costos', icon: DollarSign, roles: ['admin'] },
  { href: '/admin/personal', labelKey: 'personal', icon: UserCog, roles: ['admin'] },
  {
    href: '/admin/proveedores',
    labelKey: 'proveedores',
    icon: Building2,
    roles: ['admin', 'personal_almacen'],
  },
  { href: '/admin/alertas', labelKey: 'alertas', icon: Bell, roles: ['admin'] },
  { href: '/admin/trazabilidad', labelKey: 'trazabilidad', icon: GitBranch, roles: ['admin'] },
  { href: '/admin/turnos', labelKey: 'turnos', icon: Clock, roles: ['admin'] },
];

// Menú curado para superuser: gobierno de plataforma + visibilidad cross-tenant.
// Nota: el superuser NO ve el menú operativo (cocina, almacén, etc.) — para entrar
// como un rol operativo debe impersonar o cambiar de cuenta.
const SUPERUSER_NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon }[] = [
  { href: '/admin/tenants', labelKey: 'tenants', icon: Building2 },
  { href: '/admin/proveedores', labelKey: 'proveedores', icon: Store },
  { href: '/analytics', labelKey: 'analytics', icon: BarChart3 },
  { href: '/admin/alertas', labelKey: 'alertas', icon: Bell },
];

// Color de orientación del ícono cuando el item NO está activo (el activo usa
// el dorado de marca para reforzar la selección).
//
// Antes había trece tonos distintos, uno casi por ruta, y todos en la escala
// `-400`: calibrada para fondo oscuro, ilegible sobre la barra en tema claro.
// Además el arcoíris competía con el dorado en lugar de ayudar a orientarse.
//
// Ahora son cuatro familias que corresponden a cómo está organizada la
// operación de verdad. El color deja de decorar y pasa a decir en qué parte
// de la sala estás:
//
//   Cocina         → dorado de marca. Es el centro del negocio.
//   Almacén        → cian. Todo lo que entra y se guarda.
//   Sala           → violeta. Lo que llega al pasajero.
//   Administración → neutro. Se consulta sentado, no en servicio.
//
// Alertas es la excepción y va en `senal-aviso`: ahí el color sí es severidad.
// `primary` es un color de RELLENO: sobre la barra en tema claro daba 1,87 de
// contraste, casi invisible. Token propio, oscuro en claro y claro en oscuro.
const AREA_COCINA = 'text-area-cocina';
const AREA_ALMACEN = 'text-area-almacen';
const AREA_SALA = 'text-area-sala';
const AREA_ADMIN = 'text-muted-foreground';

const ICON_COLORS: Record<string, string> = {
  '/almacen': AREA_ALMACEN,
  '/inventario': AREA_ALMACEN,
  '/recetas': AREA_ALMACEN,
  '/admin/proveedores': AREA_ALMACEN,

  '/cocina-fria': AREA_COCINA,
  '/cocina-caliente': AREA_COCINA,
  '/cocina-amex': AREA_COCINA,
  '/produccion': AREA_COCINA,
  '/pasteleria': AREA_COCINA,

  '/pedidos': AREA_SALA,
  '/snack': AREA_SALA,
  '/buffet': AREA_SALA,
  '/admin/qr': AREA_SALA,

  '/analytics': AREA_ADMIN,
  '/admin/costos': AREA_ADMIN,
  '/admin/personal': AREA_ADMIN,
  '/admin/trazabilidad': AREA_ADMIN,
  '/admin/turnos': AREA_ADMIN,
  '/admin/tenants': AREA_ADMIN,

  '/admin/alertas': 'text-senal-aviso',
};

interface SidebarContentProps extends SidebarProps {
  onNavigate?: () => void;
  locale: 'es' | 'en';
}

function SidebarContent({ user, onNavigate, locale }: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const tRoles = useTranslations('roles');

  const handleLogout = async () => {
    const supabase = await createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  const renderItem = ({
    href,
    labelKey,
    Icon,
  }: {
    href: string;
    labelKey: string;
    Icon: LucideIcon;
  }) => {
    const isActive = pathname === href || pathname.startsWith(href + '/');
    const iconColor = ICON_COLORS[href] ?? 'text-muted-foreground';
    return (
      <Link
        key={href}
        href={href}
        {...(onNavigate && { onClick: onNavigate })}
        className={cn(
          'group flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all min-h-[40px]',
          isActive
            ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 shadow-sm shadow-primary/10'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            isActive ? 'text-primary' : iconColor,
            !isActive && 'group-hover:scale-110',
          )}
        />
        <span className="truncate">{tNav(labelKey)}</span>
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border/50">
        <div className="marca flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-headline font-semibold shrink-0 shadow-md shadow-primary/20">
          DL
        </div>
        <div className="min-w-0">
          <p className="marca text-headline font-semibold truncate text-foreground">
            Dorado Lounge
          </p>
          <p className="text-caption text-muted-foreground truncate">El Dorado · Bogotá</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {user.role === 'superuser' ? (
          <>
            <div className="px-3 pt-1 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {tNav('plataforma')}
              </p>
            </div>
            {SUPERUSER_NAV_ITEMS.map(({ href, labelKey, icon: Icon }) =>
              renderItem({ href, labelKey, Icon }),
            )}
          </>
        ) : (
          NAV_ITEMS.filter(({ roles }) => roles.includes(user.role)).map(
            ({ href, labelKey, icon: Icon }) => renderItem({ href, labelKey, Icon }),
          )
        )}
      </nav>

      {/* Usuario + logout */}
      <div className="px-2 py-3 border-t border-border/50 space-y-1 safe-pb">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-caption text-primary truncate">{tRoles(user.role)}</p>
          <p className="text-caption text-muted-foreground truncate mt-0.5">{user.email}</p>
        </div>
        <LocaleSwitcher current={locale} />
        <div className="flex items-center gap-1 px-1">
          <AlertasBell />
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent min-h-[40px]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {tNav('cerrarSesion')}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ user, locale }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-60 h-screen sticky top-0 border-r border-border/50 shrink-0">
      <SidebarContent user={user} locale={locale} />
    </aside>
  );
}

export function MobileTopBar({ user, locale }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-2 border-b border-border/50 bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80 safe-pt">
      {/* Izquierda: menú */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 max-w-[85vw]">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent user={user} locale={locale} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Centro: marca (texto se oculta en pantallas <sm para dar aire) */}
      <div className="flex items-center gap-2 min-w-0 flex-1 pl-1">
        <div className="marca flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-body font-semibold shrink-0 shadow-md shadow-primary/20">
          DL
        </div>
        <p className="marca hidden xs:block text-body font-semibold truncate">Dorado Lounge</p>
      </div>

      {/* Derecha: idioma · tema · alertas, con padding para que el badge no toque la marca */}
      <div className="flex items-center gap-0.5 shrink-0 pl-2">
        <LocaleSwitcher current={locale} compact />
        <ThemeToggle />
        <AlertasBell />
      </div>
    </header>
  );
}
