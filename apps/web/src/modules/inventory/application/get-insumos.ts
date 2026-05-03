import type { InsumoRepository } from './ports/insumo-repository.port';
import type { InsumoWithStock } from '../domain/insumo';

export async function getInsumos(repo: InsumoRepository): Promise<InsumoWithStock[]> {
  return repo.findAll();
}
