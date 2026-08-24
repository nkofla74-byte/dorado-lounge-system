'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, ClipboardList } from 'lucide-react';
import { TabBar, panelProps } from '@/components/ui/tab-bar';
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
  const tabs = showCarta
    ? ([
        { value: 'carta', label: t('tabCarta'), icon: UtensilsCrossed },
        { value: 'pedidos', label: t('tabPedidos'), icon: ClipboardList },
      ] as const)
    : ([{ value: 'pedidos', label: t('tabPedidos'), icon: ClipboardList }] as const);

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <TabBar
          tabs={[...tabs]}
          value={tab}
          onValueChange={setTab}
          ariaLabel={t('tabsAriaLabel')}
          idPrefix="pedidos"
        />
      )}

      {showCarta && (
        <div {...panelProps('pedidos', 'carta', tab === 'carta')}>
          {tab === 'carta' && (
            <CartaAmex
              carta={carta}
              onCreated={() => {
                setRefreshKey((k) => k + 1);
                setTab('pedidos');
              }}
              canToggle={canToggle}
            />
          )}
        </div>
      )}

      <div {...panelProps('pedidos', 'pedidos', tab === 'pedidos')}>
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
    </div>
  );
}
