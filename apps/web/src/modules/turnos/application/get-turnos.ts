import type { TurnoRepository } from './ports/turno-repository.port';
import type { Turno } from '../domain/turno';

export async function getTurnos(repo: TurnoRepository, tenantId: string): Promise<Turno[]> {
  return repo.findAll(tenantId);
}
