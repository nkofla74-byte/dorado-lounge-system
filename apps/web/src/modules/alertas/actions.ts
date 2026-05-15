'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { emitEvent } from '@/lib/socket/emit-event';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAlertaRepository } from './infrastructure/alerta-repository';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type { Alerta, CreateAlertaInput } from './domain/alerta';

// ── Lectura ───────────────────────────────────────────────────────────────────

export async function getAlertas(): Promise<Result<Alerta[]>> {
  try {
    const ctx = await assertCan('alertas:read');
    const repo = createAlertaRepository();
    return ok(await repo.findRecent(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getAlertasUnreadCount(): Promise<Result<number>> {
  try {
    const ctx = await assertCan('alertas:read');
    const repo = createAlertaRepository();
    return ok(await repo.countUnread(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Acciones de usuario ───────────────────────────────────────────────────────

export async function marcarAlertaLeida(alertaId: string): Promise<Result<void>> {
  try {
    const ctx = await assertCan('alertas:read');
    const repo = createAlertaRepository();
    await repo.marcarLeida(alertaId, ctx.tenantId, ctx.userId);
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function marcarTodasLeidas(): Promise<Result<void>> {
  try {
    const ctx = await assertCan('alertas:read');
    const repo = createAlertaRepository();
    await repo.marcarTodasLeidas(ctx.tenantId, ctx.userId);
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Generadores internos (llamados desde otras actions) ───────────────────────

/**
 * Crea una alerta y la emite vía Socket.io al canal ADMIN.
 * Se llama internamente (fire-and-forget) desde otros módulos.
 * Los errores se silencian para no bloquear la operación principal.
 */
export async function crearAlerta(tenantId: string, input: CreateAlertaInput): Promise<void> {
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
  } catch {
    // Best-effort: las alertas no deben bloquear operaciones de negocio
  }
}

// ── Verificadores específicos ─────────────────────────────────────────────────

/**
 * Verifica si un insumo tiene stock por debajo del mínimo y crea alerta si es el caso.
 * Idempotente: no crea duplicados si ya existe una alerta no leída del mismo tipo+recurso
 * en las últimas 4 horas.
 */
export async function checkStockMinimo(tenantId: string, insumoId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    // Obtener stock actual y stock mínimo del insumo
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

    // Dedup: no crear si hay alerta no leída reciente (4h) del mismo insumo
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

/**
 * Escanea lotes próximos a vencer (por defecto: 3 días) y genera alertas.
 * Se llama manualmente desde la UI o una tarea programada.
 */
export async function checkVencimientos(diasUmbral = 3): Promise<Result<number>> {
  try {
    const ctx = await assertCan('alertas:write');
    const admin = createAdminClient();

    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + diasUmbral);

    const { data: lotes } = await admin
      .from('lotes')
      .select('id, insumo_id, fecha_vencimiento, cantidad_actual, insumo:insumos(nombre)')
      .eq('tenant_id', ctx.tenantId)
      .eq('activo', true)
      .is('deleted_at', null)
      .gt('cantidad_actual', 0)
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', fechaLimite.toISOString().split('T')[0]!);

    if (!lotes || lotes.length === 0) return ok(0);

    let generadas = 0;
    for (const lote of lotes) {
      const insumoNombre =
        (lote.insumo as unknown as { nombre: string } | null)?.nombre ?? 'desconocido';
      const fechaVenc = lote.fecha_vencimiento!;
      const diasRestantes = Math.ceil((new Date(fechaVenc).getTime() - Date.now()) / 86400000);

      // Dedup: no crear si ya existe alerta no leída de este lote hoy
      const hoy = new Date().toISOString().split('T')[0]!;
      const { count } = await admin
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId)
        .eq('tipo', 'vencimiento')
        .eq('resource_id', lote.id)
        .eq('leida', false)
        .gte('created_at', `${hoy}T00:00:00Z`);

      if ((count ?? 0) > 0) continue;

      const severidad = diasRestantes <= 0 ? 'critical' : diasRestantes <= 1 ? 'warning' : 'info';
      await crearAlerta(ctx.tenantId, {
        tipo: 'vencimiento',
        severidad,
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

    return ok(generadas);
  } catch (e) {
    return err(toAppError(e));
  }
}

/**
 * Verifica si el precio de un lote nuevo cambió >10% vs el anterior para el mismo insumo.
 */
export async function checkCambioPrecio(
  tenantId: string,
  insumoId: string,
  nuevoCosto: number,
  loteId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // Buscar el lote anterior más reciente con costo_unitario
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
    if (cambio < 0.1) return; // menos del 10%, sin alerta

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

/**
 * Verifica pedidos AMEX activos con demora > umbral y genera alertas.
 */
export async function checkDemoraAmex(umbralMins = 15): Promise<Result<number>> {
  try {
    const ctx = await assertCan('cocina_amex:read');
    const admin = createAdminClient();

    const umbral = new Date(Date.now() - umbralMins * 60 * 1000).toISOString();

    const { data: pedidos } = await admin
      .from('pedidos')
      .select('id, numero_mesa, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('zona', 'amex')
      .in('estado', ['creado', 'recibido_cocina', 'en_preparacion'])
      .is('deleted_at', null)
      .lt('created_at', umbral);

    if (!pedidos || pedidos.length === 0) return ok(0);

    let generadas = 0;
    for (const pedido of pedidos) {
      const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId)
        .eq('tipo', 'demora_amex')
        .eq('resource_id', pedido.id)
        .eq('leida', false)
        .gte('created_at', hace1h);

      if ((count ?? 0) > 0) continue;

      const mesa = pedido.numero_mesa ?? 'sin mesa';
      const mins = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);

      await crearAlerta(ctx.tenantId, {
        tipo: 'demora_amex',
        severidad: mins >= 25 ? 'critical' : 'warning',
        titulo: `Demora Amex — ${mesa}`,
        mensaje: `Pedido ${mesa} lleva ${mins} minutos sin ser despachado.`,
        resourceId: pedido.id,
        resourceTipo: 'pedido',
      });
      generadas++;
    }

    return ok(generadas);
  } catch (e) {
    return err(toAppError(e));
  }
}
