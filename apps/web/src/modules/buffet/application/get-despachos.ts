import type { BuffetRepository } from './ports/buffet-repository.port';
import type { DespachoBuffet } from '../domain/despacho-buffet';

export async function getDespachos(
  repo: BuffetRepository,
  tenantId: string,
  turnoId?: string,
): Promise<DespachoBuffet[]> {
  return repo.findDespachos(tenantId, turnoId);
}
