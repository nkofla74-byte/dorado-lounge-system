import type { InsumoRepository } from './ports/insumo-repository.port';
import type { CreateInsumoInput, Insumo } from '../domain/insumo';

export async function createInsumo(
  repo: InsumoRepository,
  tenantId: string,
  input: CreateInsumoInput,
): Promise<Insumo> {
  return repo.create(tenantId, input);
}
