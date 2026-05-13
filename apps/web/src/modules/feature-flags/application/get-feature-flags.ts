import type { FeatureFlagRepository } from './ports/feature-flag-repository.port';
import type { FeatureFlag } from '../domain/feature-flag';

export async function getFeatureFlags(
  repo: FeatureFlagRepository,
  tenantId: string,
): Promise<FeatureFlag[]> {
  return repo.getAll(tenantId);
}
