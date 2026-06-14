'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InsumoTable } from '@/components/inventory/insumo-table';
import { AlmacenOperacionPanel } from '@/components/inventory/almacen-operacion-panel';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { LoteProximoVencer } from '@/modules/inventory/actions';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { RequisicionWithItems } from '@/modules/requisiciones/domain/requisicion';
import type { UserRole } from '@dorado/shared-types';

type Tab = 'inventario' | 'almacen';

interface InventarioViewProps {
  insumos: InsumoWithStock[];
  insumosError?: string | undefined;
  vencimientos: LoteProximoVencer[];
  proveedores: Proveedor[];
  requisiciones: RequisicionWithItems[];
  canIngresar: boolean;
  userRole?: UserRole | undefined;
}

/**
 * Hub unificado de Almacén e Inventario para admin/superuser: tab "Inventario"
 * (catálogo completo de insumos, todas las capas) + tab "Almacén" (operación de
 * bodega). Los demás roles ven la tabla de insumos directamente, sin tabs.
 */
export function InventarioView({
  insumos,
  insumosError,
  vencimientos,
  proveedores,
  requisiciones,
  canIngresar,
  userRole,
}: InventarioViewProps) {
  const t = useTranslations('inventory.tabs');
  const [tab, setTab] = useState<Tab>('inventario');

  const triggers: { value: Tab; label: string; Icon: typeof Package }[] = [
    { value: 'inventario', label: t('inventario'), Icon: Package },
    { value: 'almacen', label: t('almacen'), Icon: Warehouse },
  ];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={t('ariaLabel')}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {triggers.map(({ value, label, Icon }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" hidden={tab !== 'inventario'}>
        {tab === 'inventario' && (
          <InsumoTable initialData={insumos} error={insumosError} userRole={userRole} />
        )}
      </div>
      <div role="tabpanel" hidden={tab !== 'almacen'}>
        {tab === 'almacen' && (
          <AlmacenOperacionPanel
            insumos={insumos}
            insumosError={insumosError}
            vencimientos={vencimientos}
            proveedores={proveedores}
            requisiciones={requisiciones}
            canIngresar={canIngresar}
            userRole={userRole}
          />
        )}
      </div>
    </div>
  );
}
