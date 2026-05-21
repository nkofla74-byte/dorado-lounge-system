'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { createAuditRepository } from './infrastructure/audit-repository';
import type { Result } from '@/lib/result';
import type { AuditEntry, AuditFilters } from './domain/audit-entry';

// Superuser ve cross-tenant (sin filtro); cualquier otro rol queda acotado a su tenant.
export async function getAuditLog(filters?: AuditFilters): Promise<Result<AuditEntry[]>> {
  try {
    const ctx = await assertCan('audit:read');
    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createAuditRepository();
    return ok(await repo.findAll(scope, filters));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getAuditLogCount(filters?: AuditFilters): Promise<Result<number>> {
  try {
    const ctx = await assertCan('audit:read');
    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createAuditRepository();
    return ok(await repo.count(scope, filters));
  } catch (e) {
    return err(toAppError(e));
  }
}
