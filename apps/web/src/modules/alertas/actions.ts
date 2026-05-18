'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { auditLog } from '@/lib/audit';
import { ok, err, toAppError } from '@/lib/result';
import { createAlertaRepository } from './infrastructure/alerta-repository';
import { runCheckVencimientos, runCheckDemoraAmex } from './infrastructure/checks';
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
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'alertas.read',
      resourceType: 'alerta',
      resourceId: alertaId,
    });
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
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'alertas.read_all',
      resourceType: 'alerta',
    });
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}

// ── Verificadores ejecutables desde UI (con auth) ─────────────────────────────

export async function checkVencimientos(diasUmbral = 3): Promise<Result<number>> {
  try {
    const ctx = await assertCan('alertas:write');
    const count = await runCheckVencimientos(ctx.tenantId, diasUmbral);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'alertas.check_vencimientos',
      resourceType: 'alerta',
      payload: { diasUmbral, generadas: count },
    });
    return ok(count);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function checkDemoraAmex(umbralMins = 15): Promise<Result<number>> {
  try {
    const ctx = await assertCan('cocina_amex:read');
    const count = await runCheckDemoraAmex(ctx.tenantId, umbralMins);
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'alertas.check_demora_amex',
      resourceType: 'alerta',
      payload: { umbralMins, generadas: count },
    });
    return ok(count);
  } catch (e) {
    return err(toAppError(e));
  }
}
