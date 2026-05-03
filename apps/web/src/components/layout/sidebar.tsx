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
  LogOut,
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

const NAV_ITEMS = [
  { href: '/inventario', label: 'Inventario', icon: Package, enabled: true },
  { href: '/recetas', label: 'Recetas', icon: BookOpen, enabled: true },
  { href: '/produccion', label: 'Producción', icon: ChefHat, enabled: true },
  { href: '/pedidos', label: 'Pedidos', icon: ClipboardList, enabled: false },
  { href: '/buffet', label: 'Buffet', icon: UtensilsCrossed, enabled: false },
  { href: '/snack', label: 'Snack', icon: Coffee, enabled: false },
  { href: '/turnos', label: 'Turnos', icon: Clock, enabled: false },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, enabled: false },
] as const;

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
        {NAV_ITEMS.map(({ href, label, icon: Icon, enabled }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');

          if (!enabled) {
            return (
              <div
                key={href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/35 cursor-not-allowed select-none"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </div>
            );
          }

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
