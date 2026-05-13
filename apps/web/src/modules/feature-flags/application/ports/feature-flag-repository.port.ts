import type { FeatureFlag, CreateFeatureFlagInput } from '../../domain/feature-flag';

export interface FeatureFlagRepository {
  getAll(tenantId: string): Promise<FeatureFlag[]>;
  set(clave: string, valor: boolean, tenantId: string): Promise<FeatureFlag>;
  create(input: CreateFeatureFlagInput, tenantId: string): Promise<FeatureFlag>;
}
