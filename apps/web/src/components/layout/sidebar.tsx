'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Package,
  BookOpen,
  ChefHat,
  ClipboardList,
  UtensilsCrossed,
  Coffee,
  Clock,
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
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; roles: UserRole[] }[] = [
  {
    href: '/almacen',
    label: 'Almacén',
    icon: Package,
    roles: ['admin', 'personal_almacen'],
  },
  {
    href: '/inventario',
    label: 'Inventario',
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
    label: 'Recetas',
    icon: BookOpen,
    roles: ['admin', 'chef', 'sous_chef', 'personal_pasteleria'],
  },
  {
    href: '/cocina',
    label: 'KDS Cocina',
    icon: MonitorCheck,
    roles: ['admin', 'chef'],
  },
  {
    href: '/cocina-amex',
    label: 'KDS Amex',
    icon: MonitorCheck,
    roles: ['admin', 'sous_chef'],
  },
  {
    href: '/produccion',
    label: 'Producción',
    icon: ChefHat,
    roles: ['admin', 'chef', 'sous_chef', 'personal_pasteleria', 'steward'],
  },
  {
    href: '/pasteleria',
    label: 'Pastelería',
    icon: Coffee,
    roles: ['admin', 'personal_pasteleria'],
  },
  {
    href: '/pedidos',
    label: 'Pedidos',
    icon: ClipboardList,
    roles: ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  },
  {
    href: '/vuelos',
    label: 'Vuelos',
    icon: Plane,
    roles: ['admin', 'chef', 'sous_chef', 'mesero_amex', 'recepcion'],
  },
  {
    href: '/admin/qr',
    label: 'Generador QR',
    icon: QrCode,
    roles: ['admin', 'mesero_amex'],
  },
  {
    href: '/buffet',
    label: 'Buffet',
    icon: UtensilsCrossed,
    roles: ['admin', 'chef', 'personal_buffet'],
  },
  {
    href: '/snack',
    label: 'Snack',
    icon: Coffee,
    roles: ['admin', 'chef', 'personal_snack'],
  },
  {
    href: '/turnos',
    label: 'Turnos',
    icon: Clock,
    roles: ['admin', 'chef', 'sous_chef', 'recepcion'],
  },
  {
    href: '/afluencia',
    label: 'Afluencia',
    icon: Users,
    roles: ['admin', 'chef', 'sous_chef', 'recepcion'],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    href: '/admin/costos',
    label: 'Costos',
    icon: DollarSign,
    roles: ['admin'],
  },
  {
    href: '/admin/personal',
    label: 'Personal',
    icon: UserCog,
    roles: ['admin'],
  },
  {
    href: '/admin/proveedores',
    label: 'Proveedores',
    icon: Building2,
    roles: ['admin', 'personal_almacen'],
  },
  {
    href: '/admin/alertas',
    label: 'Alertas',
    icon: Bell,
    roles: ['admin'],
  },
  {
    href: '/admin/auditoria',
    label: 'Auditoría',
    icon: ScrollText,
    roles: ['admin'],
  },
  {
    href: '/admin/feature-flags',
    label: 'Feature Flags',
    icon: Settings2,
    roles: ['admin'],
  },
  {
    href: '/admin/permisos',
    label: 'Permisos',
    icon: ShieldCheck,
    roles: ['admin'],
  },
];

// Ítems visibles únicamente para superuser (plataforma)
const SUPERUSER_NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
];

const ROLE_LABELS: Record<UserRole, string> = {
  superuser: 'Super Usuario',
  admin: 'Administrador',
  chef: 'Chef',
  sous_chef: 'Sous Chef',
  mesero_amex: 'Mesero Amex',
  personal_snack: 'Personal Snack',
  personal_buffet: 'Personal Buffet',
  recepcion: 'Recepción',
  personal_almacen: 'Personal Almacén',
  personal_pasteleria: 'Personal Pastelería',
  steward: 'Steward',
};

interface SidebarContentProps extends SidebarProps {
  onNavigate?: () => void;
  locale: 'es' | 'en';
}

function SidebarContent({ user, onNavigate, locale }: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  const renderItem = ({ href, label, Icon }: { href: string; label: string; Icon: LucideIcon }) => {
    const isActive = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        key={href}
        href={href}
        {...(onNavigate && { onClick: onNavigate })}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]',
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Branding */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border/50">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-bold shrink-0">
          DL
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate text-foreground">Dorado Lounge</p>
          <p className="text-xs text-muted-foreground truncate">El Dorado · Bogotá</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.filter(
          ({ roles }) => user.role === 'superuser' || roles.includes(user.role),
        ).map(({ href, label, icon: Icon }) => renderItem({ href, label, Icon }))}

        {user.role === 'superuser' && (
          <>
            <div className="px-3 pt-4 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Plataforma
              </p>
            </div>
            {SUPERUSER_NAV_ITEMS.map(({ href, label, icon: Icon }) =>
              renderItem({ href, label, Icon }),
            )}
          </>
        )}
      </nav>

      {/* Usuario + logout */}
      <div className="px-2 py-3 border-t border-border/50 space-y-1 safe-pb">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-xs text-primary truncate">{ROLE_LABELS[user.role]}</p>
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
          Cerrar sesión
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
    <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 h-14 px-3 border-b border-border/50 bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80 safe-pt">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
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

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
          DL
        </div>
        <p className="text-sm font-semibold truncate">Dorado Lounge</p>
      </div>

      <AlertasBell />
      <ThemeToggle />
    </header>
  );
}
