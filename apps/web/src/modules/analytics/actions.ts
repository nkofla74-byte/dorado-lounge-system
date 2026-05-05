'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createAnalyticsRepository } from './infrastructure/analytics-repository';
import { getCogsPerPassenger as getCogsUseCase } from './application/get-cogs';
import { getConsumoVsProduccion as getConsumoUseCase } from './application/get-consumo';
import type { Result } from '@/lib/result';
import type { CogsPerPassenger, ConsumoInsumo, AnalyticsFilters } from './domain/kpi';

export async function fetchCogsPerPassenger(
  filters: AnalyticsFilters = {},
): Promise<Result<CogsPerPassenger[]>> {
  try {
    const ctx = await assertCan('analytics:read');
    const repo = createAnalyticsRepository();
    return ok(await getCogsUseCase(repo, ctx.tenantId, filters));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function fetchConsumoVsProduccion(
  filters: AnalyticsFilters = {},
): Promise<Result<ConsumoInsumo[]>> {
  try {
    const ctx = await assertCan('analytics:read');
    const repo = createAnalyticsRepository();
    return ok(await getConsumoUseCase(repo, ctx.tenantId, filters));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function refreshAnalytics(): Promise<Result<void>> {
  try {
    await assertCan('analytics:read');
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
