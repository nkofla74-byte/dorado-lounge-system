import type { ProductionRepository } from './ports/production-repository.port';
import type { Tanda } from '../domain/tanda';

export async function getTandas(repo: ProductionRepository, tenantId: string): Promise<Tanda[]> {
  return repo.findAll(tenantId);
}
