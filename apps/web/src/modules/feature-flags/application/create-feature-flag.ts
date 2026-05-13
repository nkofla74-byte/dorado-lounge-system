import type { FeatureFlagRepository } from './ports/feature-flag-repository.port';
import type { FeatureFlag, CreateFeatureFlagInput } from '../domain/feature-flag';
import { validarClave } from '../domain/feature-flag';
import { AppError } from '@/lib/result';

export async function createFeatureFlag(
  repo: FeatureFlagRepository,
  tenantId: string,
  input: CreateFeatureFlagInput,
): Promise<FeatureFlag> {
  if (!validarClave(input.clave)) {
    throw new AppError(
      'VALIDATION',
      400,
      'Clave inválida: solo minúsculas, números y _ (máx 64 chars)',
    );
  }
  return repo.create(input, tenantId);
}
