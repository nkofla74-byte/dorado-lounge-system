import type { InsumoRepository } from './ports/insumo-repository.port';
import type { UpdateInsumoInput, Insumo } from '../domain/insumo';

export async function updateInsumo(
  repo: InsumoRepository,
  tenantId: string,
  input: UpdateInsumoInput,
): Promise<Insumo> {
  return repo.update(tenantId, input);
}
