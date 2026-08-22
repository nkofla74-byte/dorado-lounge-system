'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAnalyticsRepository } from './infrastructure/analytics-repository';
import { getConsumoVsProduccion as getConsumoUseCase } from './application/get-consumo';
import type { Result } from '@/lib/result';
import type { ConsumoInsumo, AnalyticsFilters } from './domain/kpi';

// Superuser opera cross-tenant; cualquier otro rol queda acotado a su tenant.
export async function fetchConsumoVsProduccion(
  filters: AnalyticsFilters = {},
): Promise<Result<ConsumoInsumo[]>> {
  try {
    const ctx = await assertCan('analytics:read');
    const scope = ctx.role === 'superuser' ? null : ctx.tenantId;
    const repo = createAnalyticsRepository();
    return ok(await getConsumoUseCase(repo, scope, filters));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function refreshAnalytics(): Promise<Result<void>> {
  try {
    await assertCan('analytics:refresh');
    const admin = createAdminClient();
    const { error } = await admin.rpc('refresh_analytics_views');
    if (error) {
      throw new AppError('REFRESH_ERROR', 500, 'Error al refrescar las vistas de analytics.');
    }
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e));
  }
}
