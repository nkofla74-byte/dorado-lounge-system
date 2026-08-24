'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, PackageX, Clock } from 'lucide-react';
import { AlmacenPanel } from '@/components/inventory/almacen-panel';
import { NuevoIngresoDialog } from '@/components/inventory/nuevo-ingreso-dialog';
import { ProveedoresPanel } from '@/components/proveedores/proveedores-panel';
import { RequisicionesPanel } from '@/components/requisiciones/requisiciones-panel';
import { cn } from '@/lib/utils';
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

/** Urgencia de un lote por vencer. Antes había tres ramas y dos eran idénticas. */
type Urgencia = 'vencido' | 'inminente' | 'proximo';

function urgenciaDe(dias: number): Urgencia {
  if (dias <= 0) return 'vencido';
  if (dias <= 2) return 'inminente';
  return 'proximo';
}

const ESTILO_URGENCIA: Record<Urgencia, string> = {
  vencido: 'bg-destructive/10 border-destructive/40 text-destructive',
  inminente: 'bg-senal-aviso/15 border-senal-aviso/50 text-senal-aviso font-semibold',
  proximo: 'bg-muted border-border text-muted-foreground',
};

/** Orden de lectura: primero lo vencido, luego lo inminente. */
const PESO_URGENCIA: Record<Urgencia, number> = { vencido: 0, inminente: 1, proximo: 2 };

/**
 * Cuerpo operativo de bodega — recepción de lotes, atención, cola de
 * requisiciones de cocina, tabla de bodega y proveedores. Reutilizado por la
 * pantalla dedicada del almacenero (/almacen) y por la tab "Almacén" del hub
 * unificado de admin (/inventario). No incluye el título de página: lo aporta
 * cada contenedor.
 *
 * El orden lo decide cuánta gente está esperando, no la costumbre:
 *   1. Lo que exige acción ahora (stock agotado, lote vencido).
 *   2. La cola de cocina — ahí hay alguien parado esperando su insumo.
 *   3. La bodega completa, que es consulta.
 *   4. Proveedores, que es trabajo administrativo y no de servicio.
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
  const requiereAtencion = lowStock.length > 0 || vencimientos.length > 0;

  const lotesOrdenados = [...vencimientos].sort(
    (a, b) =>
      PESO_URGENCIA[urgenciaDe(a.diasRestantes)] - PESO_URGENCIA[urgenciaDe(b.diasRestantes)] ||
      a.diasRestantes - b.diasRestantes,
  );

  return (
    <div className="space-y-8">
      {/* La acción principal deja de flotar suelta arriba a la derecha: en la
          bodega se recibe mercancía con las manos ocupadas y es lo primero que
          se busca. A ancho completo en móvil. */}
      {canIngresar && (
        <div className="flex">
          <NuevoIngresoDialog insumos={insumos} />
        </div>
      )}

      {/* ── Requiere atención ──────────────────────────────────────────────
          Antes eran cuatro recuadros del mismo peso: dos alarmas y dos cuentas
          inertes, incluida una «OK» que era el complemento de «stock bajo» y no
          se podía accionar. Ahora hay un solo bloque, y solo aparece si hay algo
          que hacer: en un turno tranquilo la pantalla no grita. */}
      {requiereAtencion && (
        <section
          className="rounded-xl border border-senal-aviso/40 bg-senal-aviso/5 p-4 sm:p-5 space-y-4"
          aria-labelledby="almacen-atencion"
        >
          <h2 id="almacen-atencion" className="flex items-center gap-2 text-title font-semibold">
            <AlertTriangle className="size-5 shrink-0 text-senal-aviso" aria-hidden="true" />
            {t('requiereAtencion')}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {lowStock.length > 0 && (
              <p className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                <PackageX className="size-6 shrink-0 text-destructive" aria-hidden="true" />
                <span className="text-body">
                  <b className="text-headline font-semibold tabular-nums text-destructive">
                    {lowStock.length}
                  </b>{' '}
                  {t('statsStockBajo')}
                </span>
              </p>
            )}
            {vencimientos.length > 0 && (
              <p
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-4 py-3',
                  vencenHoy.length > 0
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-senal-aviso/40 bg-senal-aviso/10',
                )}
              >
                <Clock
                  className={cn(
                    'size-6 shrink-0',
                    vencenHoy.length > 0 ? 'text-destructive' : 'text-senal-aviso',
                  )}
                  aria-hidden="true"
                />
                <span className="text-body">
                  <b
                    className={cn(
                      'text-headline font-semibold tabular-nums',
                      vencenHoy.length > 0 ? 'text-destructive' : 'text-senal-aviso',
                    )}
                  >
                    {vencimientos.length}
                  </b>{' '}
                  {t('statsVencen7')}
                </span>
              </p>
            )}
          </div>

          {lotesOrdenados.length > 0 && (
            <div className="space-y-2">
              <p className="label-seccion">{t('lotesPorVencer')}</p>
              <ul className="flex flex-wrap gap-2">
                {lotesOrdenados.map((v) => {
                  const urgencia = urgenciaDe(v.diasRestantes);
                  return (
                    <li
                      key={v.loteId}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-medium',
                        ESTILO_URGENCIA[urgencia],
                      )}
                    >
                      {v.insumoNombre}
                      <span className={urgencia === 'proximo' ? 'opacity-70' : undefined}>
                        {v.diasRestantes <= 0
                          ? `— ${t('vencido')}`
                          : v.diasRestantes === 1
                            ? `— ${t('manana')}`
                            : `— ${t('diasShort', { n: v.diasRestantes })}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Cola de cocina ─────────────────────────────────────────────────
          Sube al segundo lugar. Estaba enterrada bajo la tabla completa de
          bodega, y es el único bloque de la pantalla donde hay una persona
          esperando al otro lado. */}
      <section className="space-y-3" aria-labelledby="almacen-requisiciones">
        <h2 id="almacen-requisiciones" className="text-title font-semibold tracking-tight">
          {tReq('tituloAlmacen')}
        </h2>
        <RequisicionesPanel mode="almacen" initialRequisiciones={requisiciones} />
      </section>

      {/* ── Bodega ─────────────────────────────────────────────────────────
          La consulta del catálogo: importante, pero no urgente. */}
      <section className="space-y-3" aria-labelledby="almacen-bodega">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="almacen-bodega" className="text-title font-semibold tracking-tight">
            {t('statsInsumosBodega')}
          </h2>
          <p className="text-caption text-muted-foreground tabular-nums">
            {t('insumosEnBodega', { n: capa1.length })}
          </p>
        </div>
        {insumosError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body text-destructive"
          >
            {insumosError}
          </p>
        ) : (
          <AlmacenPanel initialData={capa1} userRole={userRole} />
        )}
      </section>

      {/* ── Proveedores ────────────────────────────────────────────────────
          Trabajo administrativo, no de servicio. Se separa con una regla para
          que no compita con lo operativo de arriba. */}
      <section className="space-y-3 border-t border-border pt-8" aria-labelledby="almacen-prov">
        <div>
          <h2 id="almacen-prov" className="text-title font-semibold tracking-tight">
            {t('proveedoresTitle')}
          </h2>
          <p className="text-caption text-muted-foreground mt-1">{t('proveedoresSubtitle')}</p>
        </div>
        <ProveedoresPanel initialData={proveedores} canWrite={canIngresar} />
      </section>
    </div>
  );
}
