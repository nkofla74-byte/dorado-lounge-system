// Funciones internas de generación de alertas. NO son Server Actions.
// Se invocan fire-and-forget desde otros módulos del servidor.
// Los errores se silencian intencionalmente para no bloquear la operación principal.

import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAlertaRepository } from './alerta-repository';
import { CHANNELS } from '@dorado/shared-types';
import type { Alerta, CreateAlertaInput } from '../domain/alerta';

export async function crearAlerta(
  tenantId: string,
  input: CreateAlertaInput,
): Promise<Alerta | null> {
  try {
    const repo = createAlertaRepository();
    const alerta = await repo.create(tenantId, input);

    await emitEvent(tenantId, CHANNELS.ADMIN, {
      type: 'ALERTA',
      payload: {
        alertaId: alerta.id,
        tenantId: alerta.tenantId,
        tipo: alerta.tipo,
        severidad: alerta.severidad,
        titulo: alerta.titulo,
        mensaje: alerta.mensaje,
        ...(alerta.resourceId ? { resourceId: alerta.resourceId } : {}),
        ...(alerta.resourceTipo ? { resourceTipo: alerta.resourceTipo } : {}),
        createdAt: alerta.createdAt.toISOString(),
      },
    });

    return alerta;
  } catch {
    return null;
  }
}

export async function checkStockMinimo(tenantId: string, insumoId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: insumo } = await admin
      .from('insumos')
      .select('nombre, stock_minimo')
      .eq('id', insumoId)
      .eq('tenant_id', tenantId)
      .single();

    if (!insumo) return;

    const { data: lotes } = await admin
      .from('lotes')
      .select('cantidad_actual')
      .eq('insumo_id', insumoId)
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .is('deleted_at', null);

    const stockActual = (lotes ?? []).reduce((sum, l) => sum + Number(l.cantidad_actual), 0);

    if (stockActual >= Number(insumo.stock_minimo)) return;

    const hace4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('alertas')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('tipo', 'stock_minimo')
      .eq('resource_id', insumoId)
      .eq('leida', false)
      .gte('created_at', hace4h);

    if ((count ?? 0) > 0) return;

    const severidad = stockActual === 0 ? 'critical' : 'warning';
    await crearAlerta(tenantId, {
      tipo: 'stock_minimo',
      severidad,
      titulo: `Stock bajo: ${insumo.nombre}`,
      mensaje: `Stock actual (${stockActual.toFixed(2)}) está por debajo del mínimo (${Number(insumo.stock_minimo).toFixed(2)}).`,
      resourceId: insumoId,
      resourceTipo: 'insumo',
    });
  } catch {
    // Best-effort
  }
}

export async function checkCambioPrecio(
  tenantId: string,
  insumoId: string,
  nuevoCosto: number,
  loteId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: anterior } = await admin
      .from('lotes')
      .select('costo_unitario, insumo:insumos(nombre)')
      .eq('insumo_id', insumoId)
      .eq('tenant_id', tenantId)
      .neq('id', loteId)
      .not('costo_unitario', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anterior || anterior.costo_unitario == null) return;

    const costoAnterior = Number(anterior.costo_unitario);
    if (costoAnterior === 0) return;

    const cambio = Math.abs((nuevoCosto - costoAnterior) / costoAnterior);
    if (cambio < 0.1) return;

    const insumoNombre =
      (anterior.insumo as unknown as { nombre: string } | null)?.nombre ?? 'insumo';
    const pct = (cambio * 100).toFixed(1);
    const direccion = nuevoCosto > costoAnterior ? 'subió' : 'bajó';

    await crearAlerta(tenantId, {
      tipo: 'cambio_precio',
      severidad: cambio >= 0.25 ? 'critical' : 'warning',
      titulo: `Precio ${direccion}: ${insumoNombre}`,
      mensaje: `El costo unitario ${direccion} un ${pct}% (anterior: $${costoAnterior.toLocaleString('es-CO')} → nuevo: $${nuevoCosto.toLocaleString('es-CO')}).`,
      resourceId: loteId,
      resourceTipo: 'lote',
    });
  } catch {
    // Best-effort
  }
}
