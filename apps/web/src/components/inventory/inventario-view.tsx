'use client';

import { useRef, useState } from 'react';
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
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // `role="tablist"` le promete a un lector de pantalla que las flechas mueven
  // entre pestañas. Estaba anunciado y no implementado, que es peor que no
  // poner el rol: el usuario pulsa la flecha y no pasa nada.
  function alPulsarTecla(e: React.KeyboardEvent) {
    const i = TABS.indexOf(tab);
    let destino: Tab | undefined;
    if (e.key === 'ArrowRight') destino = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') destino = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') destino = TABS[0];
    else if (e.key === 'End') destino = TABS[TABS.length - 1];
    if (!destino) return;
    e.preventDefault();
    setTab(destino);
    refs.current[destino]?.focus();
  }

  const ICONO: Record<Tab, typeof Package> = { inventario: Package, almacen: Warehouse };

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={t('ariaLabel')}
        onKeyDown={alPulsarTecla}
        className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1"
      >
        {TABS.map((value) => {
          const activa = tab === value;
          const Icon = ICONO[value];
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`tab-${value}`}
              aria-selected={activa}
              aria-controls={`panel-${value}`}
              // Tabindex móvil: el tabulador entra al grupo por la pestaña
              // activa, no recorre todas una por una.
              tabIndex={activa ? 0 : -1}
              ref={(el) => {
                refs.current[value] = el;
              }}
              onClick={() => setTab(value)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-body font-medium',
                'transition-colors duration-200 ease-smooth',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activa
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {t(value)}
            </button>
          );
        })}
      </div>

      {TABS.map((value) => (
        <div
          key={value}
          role="tabpanel"
          id={`panel-${value}`}
          aria-labelledby={`tab-${value}`}
          hidden={tab !== value}
        >
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
