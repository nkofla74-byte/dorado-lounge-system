'use client';

import { useTranslations } from 'next-intl';
import { AlmacenPanel } from '@/components/inventory/almacen-panel';
import { NuevoIngresoDialog } from '@/components/inventory/nuevo-ingreso-dialog';
import { ProveedoresPanel } from '@/components/proveedores/proveedores-panel';
import { RequisicionesPanel } from '@/components/requisiciones/requisiciones-panel';
import type { InsumoWithStock } from '@/modules/inventory/domain/insumo';
import type { LoteProximoVencer } from '@/modules/inventory/actions';
import type { Proveedor } from '@/modules/proveedores/domain/proveedor';
import type { RequisicionWithItems } from '@/modules/requisiciones/domain/requisicion';
import type { UserRole } from '@dorado/shared-types';

interface AlmacenOperacionPanelProps {
  /** Catálogo completo de insumos — el diálogo de ingreso opera sobre todos. */
  insumos: InsumoWithStock[];
  vencimientos: LoteProximoVencer[];
  proveedores: Proveedor[];
  requisiciones: RequisicionWithItems[];
  canIngresar: boolean;
  userRole?: UserRole | undefined;
  /** Mensaje de error si falló la carga de insumos (reemplaza la tabla de bodega). */
  insumosError?: string | undefined;
}

/**
 * Cuerpo operativo de bodega — stats, recepción de lotes, alertas de
 * vencimiento, cola de requisiciones de cocina y proveedores. Reutilizado por
 * la pantalla dedicada del almacenero (/almacen) y por la tab "Almacén" del
 * hub unificado de admin (/inventario). No incluye el título de página: lo
 * aporta cada contenedor.
 */
export function AlmacenOperacionPanel({
  insumos,
  vencimientos,
  proveedores,
  requisiciones,
  canIngresar,
  userRole,
  insumosError,
}: AlmacenOperacionPanelProps) {
  const t = useTranslations('inventory.almacenPage');
  const tReq = useTranslations('requisiciones.panel');

  const capa1 = insumos.filter((i) => i.capa === 'capa_1');
  const lowStock = capa1.filter((i) => i.stockActual <= i.stockMinimo);
  const vencenHoy = vencimientos.filter((v) => v.diasRestantes <= 0);

  return (
    <div className="space-y-6">
      {canIngresar && (
        <div className="flex justify-end">
          <NuevoIngresoDialog insumos={insumos} />
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsInsumosBodega')}
          </p>
          <p className="text-2xl font-bold tabular-nums">{capa1.length}</p>
        </div>
        <div
          className={`rounded-lg border px-5 py-4 space-y-1 ${
            lowStock.length > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsStockBajo')}
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${lowStock.length > 0 ? 'text-destructive' : ''}`}
          >
            {lowStock.length}
          </p>
        </div>
        <div
          className={`rounded-lg border px-5 py-4 space-y-1 ${
            vencenHoy.length > 0
              ? 'border-destructive/40 bg-destructive/5'
              : vencimientos.length > 0
                ? 'border-amber-500/40 bg-amber-500/5'
                : 'border-border bg-card'
          }`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsVencen7')}
          </p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              vencenHoy.length > 0
                ? 'text-destructive'
                : vencimientos.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : ''
            }`}
          >
            {vencimientos.length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {t('statsOk')}
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {capa1.length - lowStock.length}
          </p>
        </div>
      </div>

      {/* Alerta de vencimientos próximos */}
      {vencimientos.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            {t('lotesPorVencer')}
          </p>
          <div className="flex flex-wrap gap-2">
            {vencimientos.map((v) => (
              <span
                key={v.loteId}
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                  v.diasRestantes <= 0
                    ? 'bg-destructive/10 border-destructive/30 text-destructive'
                    : v.diasRestantes <= 2
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                }`}
              >
                {v.insumoNombre}
                <span className="opacity-70">
                  {v.diasRestantes <= 0
                    ? `— ${t('vencido')}`
                    : v.diasRestantes === 1
                      ? `— ${t('manana')}`
                      : `— ${t('diasShort', { n: v.diasRestantes })}`}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {insumosError ? (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-md">
          {insumosError}
        </div>
      ) : (
        <AlmacenPanel initialData={capa1} userRole={userRole} />
      )}

      {/* Requisiciones de cocina: cola en tiempo real (alistar → despachar) */}
      <section className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">{tReq('tituloAlmacen')}</h2>
        <RequisicionesPanel mode="almacen" initialRequisiciones={requisiciones} />
      </section>

      {/* Proveedores: gestión rápida desde la pantalla operativa */}
      <section className="space-y-3 pt-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('proveedoresTitle')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('proveedoresSubtitle')}</p>
        </div>
        <ProveedoresPanel initialData={proveedores} canWrite={canIngresar} />
      </section>
    </div>
  );
}
