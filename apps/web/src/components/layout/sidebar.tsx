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
  UtensilsCrossed,
  Coffee,
  BarChart3,
  DollarSign,
  Users,
  Building2,
  LogOut,
  Menu,
  MonitorCheck,
  QrCode,
  UserCog,
  Plane,
  ShieldCheck,
  Settings2,
  Bell,
  ScrollText,
  Store,
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

// roles autorizados por ruta — espejo de ROLE_ALLOWED_PREFIXES en middleware.ts.
// superuser ve todo: se maneja en el filtro del componente, no aquí.
// `labelKey` referencia messages/<locale>.json → nav.<labelKey>
const NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon; roles: UserRole[] }[] = [
  { href: '/almacen', labelKey: 'almacen', icon: Package, roles: ['admin', 'personal_almacen'] },
  {
    href: '/inventario',
    labelKey: 'inventario',
    icon: Package,
    roles: [
      'admin',
      'chef',
      'sous_chef',
      'personal_snack',
      'personal_buffet',
      'personal_almacen',
      'personal_pasteleria',
      'steward',
    ],
  },
  {
    href: '/recetas',
    labelKey: 'recetas',
    icon: BookOpen,
    roles: ['admin', 'chef', 'sous_chef', 'personal_pasteleria'],
  },
  { href: '/cocina', labelKey: 'cocina', icon: MonitorCheck, roles: ['admin', 'chef'] },
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
    roles: ['admin', 'chef', 'sous_chef', 'personal_pasteleria', 'steward'],
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
    roles: ['admin', 'chef', 'sous_chef', 'mesero_amex'],
  },
  {
    href: '/vuelos',
    labelKey: 'vuelos',
    icon: Plane,
    roles: ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  },
  { href: '/admin/qr', labelKey: 'qrGenerator', icon: QrCode, roles: ['admin'] },
  {
    href: '/buffet',
    labelKey: 'buffet',
    icon: UtensilsCrossed,
    roles: ['admin', 'chef', 'personal_buffet'],
  },
  { href: '/snack', labelKey: 'snack', icon: Coffee, roles: ['admin', 'chef', 'personal_snack'] },
  {
    href: '/afluencia',
    labelKey: 'afluencia',
    icon: Users,
    roles: ['admin', 'chef', 'sous_chef', 'recepcion'],
  },
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
  { href: '/admin/auditoria', labelKey: 'auditoria', icon: ScrollText, roles: ['admin'] },
  { href: '/admin/feature-flags', labelKey: 'featureFlags', icon: Settings2, roles: ['admin'] },
  { href: '/admin/permisos', labelKey: 'permisos', icon: ShieldCheck, roles: ['admin'] },
];

// Menú curado para superuser: gobierno de plataforma + visibilidad cross-tenant.
// Nota: el superuser NO ve el menú operativo (cocina, almacén, etc.) — para entrar
// como un rol operativo debe impersonar o cambiar de cuenta.
const SUPERUSER_NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon }[] = [
  { href: '/admin/tenants', labelKey: 'tenants', icon: Building2 },
  { href: '/admin/proveedores', labelKey: 'proveedores', icon: Store },
  { href: '/analytics', labelKey: 'analytics', icon: BarChart3 },
  { href: '/admin/alertas', labelKey: 'alertas', icon: Bell },
  { href: '/admin/auditoria', labelKey: 'auditoria', icon: ScrollText },
  { href: '/admin/permisos', labelKey: 'permisos', icon: ShieldCheck },
];

// Color de marca por categoría operativa. Se aplica al ícono cuando el item
// NO está activo (el activo usa primary dorado para reforzar la selección).
const ICON_COLORS: Record<string, string> = {
  '/almacen': 'text-sky-400',
  '/inventario': 'text-sky-400',
  '/recetas': 'text-amber-400',
  '/cocina': 'text-rose-400',
  '/cocina-amex': 'text-violet-400',
  '/produccion': 'text-orange-400',
  '/pasteleria': 'text-pink-400',
  '/pedidos': 'text-emerald-400',
  '/vuelos': 'text-cyan-400',
  '/admin/qr': 'text-indigo-400',
  '/buffet': 'text-lime-400',
  '/snack': 'text-yellow-400',
  '/afluencia': 'text-teal-400',
  '/analytics': 'text-fuchsia-400',
  '/admin/costos': 'text-primary',
  '/admin/personal': 'text-slate-400',
  '/admin/proveedores': 'text-sky-400',
  '/admin/alertas': 'text-amber-400',
  '/admin/auditoria': 'text-purple-400',
  '/admin/feature-flags': 'text-zinc-400',
  '/admin/permisos': 'text-red-400',
  '/admin/tenants': 'text-violet-400',
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
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-amber-600 text-primary-foreground text-sm font-bold shrink-0 shadow-md shadow-primary/20">
          DL
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate text-foreground tracking-tight">
            Dorado Lounge
          </p>
          <p className="text-xs text-muted-foreground truncate">El Dorado · Bogotá</p>
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
          <p className="text-xs text-primary truncate">{tRoles(user.role)}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
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
            className="h-9 w-9 shrink-0"
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
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gradient-to-br from-primary to-amber-600 text-primary-foreground text-xs font-bold shrink-0 shadow-md shadow-primary/20">
          DL
        </div>
        <p className="hidden xs:block text-sm font-semibold truncate tracking-tight">
          Dorado Lounge
        </p>
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
