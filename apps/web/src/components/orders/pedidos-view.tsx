'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CartaAmex } from './carta-amex';
import { PedidoTable } from './pedido-table';
import type { PedidoWithItems } from '@/modules/orders/domain/pedido';
import type { CartaReceta } from '@/modules/orders/actions';
import type { UserRole } from '@dorado/shared-types';

type Tab = 'carta' | 'pedidos';

const ADMIN_ROLES = new Set<UserRole>(['superuser', 'admin']);
const MESERO_ROLES = new Set<UserRole>(['superuser', 'admin', 'mesero_amex']);
const TOGGLE_ROLES = new Set<UserRole>(['superuser', 'admin', 'mesero_amex', 'sous_chef']);

interface Props {
  initialData: PedidoWithItems[];
  carta: CartaReceta[];
  userRole: UserRole | undefined;
  error?: string | undefined;
}

export function PedidosView({ initialData, carta, userRole, error }: Props) {
  const t = useTranslations('pedidos');
  const isAdmin = userRole ? ADMIN_ROLES.has(userRole) : false;
  const isMesero = userRole ? MESERO_ROLES.has(userRole) : false;
  const canToggle = userRole ? TOGGLE_ROLES.has(userRole) : false;
  const [tab, setTab] = useState<Tab>(isAdmin ? 'pedidos' : isMesero ? 'carta' : 'pedidos');
  const [refreshKey, setRefreshKey] = useState(0);

  const showCarta = !isAdmin && (isMesero || canToggle);
  const tabs: { key: Tab; label: string; icon: typeof UtensilsCrossed }[] = showCarta
    ? [
        { key: 'carta', label: t('tabCarta'), icon: UtensilsCrossed },
        { key: 'pedidos', label: t('tabPedidos'), icon: ClipboardList },
      ]
    : [{ key: 'pedidos', label: t('tabPedidos'), icon: ClipboardList }];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
                key !== tabs[0]!.key && 'border-l border-border',
                tab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {tab === 'carta' && showCarta && (
        <CartaAmex
          carta={carta}
          onCreated={() => {
            setRefreshKey((k) => k + 1);
            setTab('pedidos');
          }}
          canToggle={canToggle}
        />
      )}

      {tab === 'pedidos' && (
        <PedidoTable
          key={refreshKey}
          initialData={initialData}
          userRole={userRole}
          error={error}
          readOnly={isAdmin}
        />
      )}
    </div>
  );
}
