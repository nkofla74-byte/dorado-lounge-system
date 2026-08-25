'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, Warehouse } from 'lucide-react';
import { TabBar, panelProps } from '@/components/ui/tab-bar';
import { InsumoTable } from '@/components/inventory/insumo-table';
import { AlmacenOperacionPanel } from '@/components/inventory/almacen-operacion-panel';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { LoteProximoVencer } from '@/modules/inventory/actions';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { RequisicionWithItems } from '@/modules/requisiciones/domain/requisicion';
import type { UserRole } from '@dorado/shared-types';

type Tab = 'inventario' | 'almacen';

const TABS: Tab[] = ['inventario', 'almacen'];

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
  const ICONO: Record<Tab, typeof Package> = { inventario: Package, almacen: Warehouse };
  const defs = TABS.map((value) => ({ value, label: t(value), icon: ICONO[value] }));

  return (
    <div className="space-y-6">
      <TabBar
        tabs={defs}
        value={tab}
        onValueChange={setTab}
        ariaLabel={t('ariaLabel')}
        idPrefix="inventario"
      />

      {TABS.map((value) => (
        <div key={value} {...panelProps('inventario', value, tab === value)}>
          {tab === value &&
            (value === 'inventario' ? (
              <InsumoTable initialData={insumos} error={insumosError} userRole={userRole} />
            ) : (
              <AlmacenOperacionPanel
                insumos={insumos}
                insumosError={insumosError}
                vencimientos={vencimientos}
                proveedores={proveedores}
                requisiciones={requisiciones}
                canIngresar={canIngresar}
                userRole={userRole}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
