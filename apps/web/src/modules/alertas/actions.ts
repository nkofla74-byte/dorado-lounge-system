'use server';

import { assertCan } from '@/lib/auth/assertCan';
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

// ── Verificadores ejecutables desde UI (con auth) ─────────────────────────────

export async function checkVencimientos(diasUmbral = 3): Promise<Result<number>> {
  try {
    const ctx = await assertCan('alertas:write');
    return ok(await runCheckVencimientos(ctx.tenantId, diasUmbral));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function checkDemoraAmex(umbralMins = 15): Promise<Result<number>> {
  try {
    const ctx = await assertCan('cocina_amex:read');
    return ok(await runCheckDemoraAmex(ctx.tenantId, umbralMins));
  } catch (e) {
    return err(toAppError(e));
  }
}
