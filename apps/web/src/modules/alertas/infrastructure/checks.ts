// Funciones internas de generación de alertas. NO son Server Actions.
// Se invocan fire-and-forget desde otros módulos del servidor.
// Los errores se silencian intencionalmente para no bloquear la operación principal.

import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAlertaRepository } from './alerta-repository';
import { CHANNELS } from '@dorado/shared-types';
import type { Alerta, CreateAlertaInput } from '../domain/alerta';
import {
  severidadStockMinimo,
  severidadCambioPrecio,
  severidadVencimiento,
  severidadDemoraAmex,
} from '../domain/alerta';

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

// ── Checks reactivos (llamados desde inventory/actions al crear/consumir lotes) ─

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

    await crearAlerta(tenantId, {
      tipo: 'stock_minimo',
      severidad: severidadStockMinimo(stockActual),
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

    const cambio = (nuevoCosto - costoAnterior) / costoAnterior;
    const severidad = severidadCambioPrecio(cambio);
    if (!severidad) return;

    const insumoNombre =
      (anterior.insumo as unknown as { nombre: string } | null)?.nombre ?? 'insumo';
    const pct = (Math.abs(cambio) * 100).toFixed(1);
    const direccion = nuevoCosto > costoAnterior ? 'subió' : 'bajó';

    await crearAlerta(tenantId, {
      tipo: 'cambio_precio',
      severidad,
      titulo: `Precio ${direccion}: ${insumoNombre}`,
      mensaje: `El costo unitario ${direccion} un ${pct}% (anterior: $${costoAnterior.toLocaleString('es-CO')} → nuevo: $${nuevoCosto.toLocaleString('es-CO')}).`,
      resourceId: loteId,
      resourceTipo: 'lote',
    });
  } catch {
    // Best-effort
  }
}

// ── Checks programados (sin contexto de usuario, llamados desde cron) ─────────

export async function runCheckVencimientos(tenantId: string, diasUmbral = 3): Promise<number> {
  const admin = createAdminClient();

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + diasUmbral);

  const { data: lotes } = await admin
    .from('lotes')
    .select('id, fecha_vencimiento, cantidad_actual, insumo:insumos(nombre)')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .is('deleted_at', null)
    .gt('cantidad_actual', 0)
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', fechaLimite.toISOString().split('T')[0]!);

  if (!lotes || lotes.length === 0) return 0;

  let generadas = 0;
  const hoy = new Date().toISOString().split('T')[0]!;

  // Batch: una sola query para todos los lotes en vez de O(N) queries
  const { data: alertasHoy } = await admin
    .from('alertas')
    .select('resource_id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'vencimiento')
    .eq('leida', false)
    .gte('created_at', `${hoy}T00:00:00Z`)
    .in(
      'resource_id',
      lotes.map((l) => l.id),
    );

  const yaNotificados = new Set(alertasHoy?.map((a) => a.resource_id) ?? []);

  for (const lote of lotes) {
    if (yaNotificados.has(lote.id)) continue;

    const insumoNombre =
      (lote.insumo as unknown as { nombre: string } | null)?.nombre ?? 'desconocido';
    const fechaVenc = lote.fecha_vencimiento!;
    const diasRestantes = Math.ceil((new Date(fechaVenc).getTime() - Date.now()) / 86400000);

    await crearAlerta(tenantId, {
      tipo: 'vencimiento',
      severidad: severidadVencimiento(diasRestantes),
      titulo: `Vencimiento: ${insumoNombre}`,
      mensaje:
        diasRestantes <= 0
          ? `Lote de ${insumoNombre} ya venció (${fechaVenc}).`
          : `Lote de ${insumoNombre} vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} (${fechaVenc}).`,
      resourceId: lote.id,
      resourceTipo: 'lote',
    });
    generadas++;
  }

  return generadas;
}

export async function runCheckDemoraAmex(tenantId: string, umbralMins = 15): Promise<number> {
  const admin = createAdminClient();
  const umbral = new Date(Date.now() - umbralMins * 60 * 1000).toISOString();

  const { data: pedidos } = await admin
    .from('pedidos')
    .select('id, numero_mesa, created_at')
    .eq('tenant_id', tenantId)
    .eq('zona', 'amex')
    .in('estado', ['creado', 'recibido_cocina', 'en_preparacion'])
    .is('deleted_at', null)
    .lt('created_at', umbral);

  if (!pedidos || pedidos.length === 0) return 0;

  let generadas = 0;
  const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Batch: una sola query para todos los pedidos en vez de O(N) queries
  const { data: alertasRecientes } = await admin
    .from('alertas')
    .select('resource_id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'demora_amex')
    .eq('leida', false)
    .gte('created_at', hace1h)
    .in(
      'resource_id',
      pedidos.map((p) => p.id),
    );

  const yaNotificados = new Set(alertasRecientes?.map((a) => a.resource_id) ?? []);

  for (const pedido of pedidos) {
    if (yaNotificados.has(pedido.id)) continue;

    const mesa = pedido.numero_mesa ?? 'sin mesa';
    const mins = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);

    await crearAlerta(tenantId, {
      tipo: 'demora_amex',
      severidad: severidadDemoraAmex(mins),
      titulo: `Demora Amex — ${mesa}`,
      mensaje: `Pedido ${mesa} lleva ${mins} minutos sin ser despachado.`,
      resourceId: pedido.id,
      resourceTipo: 'pedido',
    });
    generadas++;
  }

  return generadas;
}
