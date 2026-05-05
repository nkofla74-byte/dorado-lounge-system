import type { SnackRepository } from './ports/snack-repository.port';
import type { DespachoSnack } from '../domain/despacho-snack';

export async function getDespachos(
  repo: SnackRepository,
  tenantId: string,
  turnoId?: string,
): Promise<DespachoSnack[]> {
  return repo.findDespachos(tenantId, turnoId);
}
