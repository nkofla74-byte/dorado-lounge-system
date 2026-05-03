import type { InsumoRepository } from './ports/insumo-repository.port';
import type { Lote, CreateLoteInput } from '../domain/insumo';

export async function createLote(
  repo: InsumoRepository,
  tenantId: string,
  input: CreateLoteInput,
): Promise<Lote> {
  return repo.createLote(tenantId, input);
}
