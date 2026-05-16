'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAlertaRepository } from './infrastructure/alerta-repository';
import { crearAlerta } from './infrastructure/checks';
import type { Result } from '@/lib/result';
import type { Alerta } from './domain/alerta';

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

export async function getAlertasAdmin(): Promise<Result<Alerta[]>> {
  try {
    const ctx = await assertCan('alertas:read');
    const repo = createAlertaRepository();
    return ok(await repo.findAll(ctx.tenantId));
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

// ── Verificadores ejecutables desde UI/cron ───────────────────────────────────

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
