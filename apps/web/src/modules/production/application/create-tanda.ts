import type { ProductionRepository } from './ports/production-repository.port';
import type { Tanda, CreateTandaInput } from '../domain/tanda';

export async function createTanda(
  repo: ProductionRepository,
  tenantId: string,
  input: CreateTandaInput,
): Promise<Tanda> {
  return repo.create(tenantId, input);
}
