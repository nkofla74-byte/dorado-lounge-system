import type { FeatureFlagRepository } from './ports/feature-flag-repository.port';
import type { FeatureFlag } from '../domain/feature-flag';
import { AppError } from '@/lib/result';

export async function setFeatureFlag(
  repo: FeatureFlagRepository,
  tenantId: string,
  clave: string,
  valor: boolean,
): Promise<FeatureFlag> {
  if (!clave.trim()) throw new AppError('VALIDATION', 400, 'Clave requerida');
  return repo.set(clave, valor, tenantId);
}
