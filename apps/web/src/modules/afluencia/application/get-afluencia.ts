import type { AfluenciaRepository } from './ports/afluencia-repository.port';
import type { AfluenciaIngreso } from '../domain/afluencia';

export async function getAfluenciaByTurno(
  repo: AfluenciaRepository,
  tenantId: string,
  turnoId: string,
): Promise<AfluenciaIngreso[]> {
  return repo.findByTurno(tenantId, turnoId);
}

export async function getTotalPasajeros(
  repo: AfluenciaRepository,
  tenantId: string,
  turnoId: string,
): Promise<number> {
  return repo.getTotalByTurno(tenantId, turnoId);
}
