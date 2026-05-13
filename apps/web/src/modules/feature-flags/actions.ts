'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createFeatureFlagRepository } from './infrastructure/feature-flag-repository';
import { getFeatureFlags as getFeatureFlagsUseCase } from './application/get-feature-flags';
import { setFeatureFlag as setFeatureFlagUseCase } from './application/set-feature-flag';
import { createFeatureFlag as createFeatureFlagUseCase } from './application/create-feature-flag';
import type { Result } from '@/lib/result';
import type { FeatureFlag, CreateFeatureFlagInput } from './domain/feature-flag';

export async function getFeatureFlags(): Promise<Result<FeatureFlag[]>> {
  try {
    const ctx = await assertCan('feature_flags:read');
    const repo = createFeatureFlagRepository();
    return ok(await getFeatureFlagsUseCase(repo, ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function setFeatureFlag(clave: string, valor: boolean): Promise<Result<FeatureFlag>> {
  try {
    const ctx = await assertCan('feature_flags:write');
    const repo = createFeatureFlagRepository();
    const flag = await setFeatureFlagUseCase(repo, ctx.tenantId, clave, valor);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'feature_flags.toggled',
      resourceType: 'feature_flags',
      resourceId: flag.id,
      payload: { clave, valor },
    });

    return ok(flag);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function createFeatureFlag(
  input: CreateFeatureFlagInput,
): Promise<Result<FeatureFlag>> {
  try {
    const ctx = await assertCan('feature_flags:write');
    const repo = createFeatureFlagRepository();
    const flag = await createFeatureFlagUseCase(repo, ctx.tenantId, input);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'feature_flags.created',
      resourceType: 'feature_flags',
      resourceId: flag.id,
      payload: { clave: input.clave, valor: input.valor ?? false },
    });

    return ok(flag);
  } catch (e) {
    return err(toAppError(e));
  }
}
