'use client';

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
  Users,
  Building2,
  LogOut,
  MonitorCheck,
  QrCode,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserRole } from '@dorado/shared-types';

interface SidebarUser {
  name: string;
  email: string;
  role: UserRole;
}

interface SidebarProps {
  user: SidebarUser;
}

// roles autorizados por ruta (espejo de la matriz PERMISSIONS en assertCan.ts).
// superuser ve todo — se maneja en el filtro del componente, no aquí.
const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; roles: UserRole[] }[] = [
  {
    href: '/inventario',
    label: 'Inventario',
    icon: Package,
    roles: ['admin', 'chef', 'sous_chef', 'personal_snack', 'personal_buffet'],
  },
  {
    href: '/recetas',
    label: 'Recetas',
    icon: BookOpen,
    roles: ['admin', 'chef', 'sous_chef'],
  },
  {
    href: '/cocina',
    label: 'KDS Cocina',
    icon: MonitorCheck,
    roles: ['admin', 'chef', 'sous_chef'],
  },
  {
    href: '/produccion',
    label: 'Producción',
    icon: ChefHat,
    roles: ['admin', 'chef', 'sous_chef'],
  },
  {
    href: '/pedidos',
    label: 'Pedidos',
    icon: ClipboardList,
    roles: ['admin', 'chef', 'sous_chef', 'mesero_amex'],
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
    roles: ['admin', 'chef', 'sous_chef', 'personal_buffet'],
  },
  {
    href: '/snack',
    label: 'Snack',
    icon: Coffee,
    roles: ['admin', 'chef', 'sous_chef', 'personal_snack'],
  },
  {
    href: '/turnos',
    label: 'Turnos',
    icon: Clock,
    roles: ['admin', 'chef', 'sous_chef'],
  },
  {
    href: '/afluencia',
    label: 'Afluencia',
    icon: Users,
    roles: ['admin', 'chef', 'sous_chef'],
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    roles: ['admin'],
  },
  {
    href: '/admin/personal',
    label: 'Personal',
    icon: UserCog,
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
};

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="flex flex-col w-60 h-screen sticky top-0 overflow-y-auto bg-sidebar border-r border-border/50 shrink-0">
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
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.filter(
          ({ roles }) => user.role === 'superuser' || roles.includes(user.role),
        ).map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {user.role === 'superuser' && (
          <>
            <div className="px-3 pt-4 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Plataforma
              </p>
            </div>
            {SUPERUSER_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Usuario + logout */}
      <div className="px-2 py-3 border-t border-border/50 space-y-1">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-xs text-primary truncate">{ROLE_LABELS[user.role]}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
