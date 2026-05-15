import type { TurnoRepository } from './ports/turno-repository.port';
import type { Turno } from '../domain/turno';
import { TurnoYaActivoError } from '../domain/turno';

export async function createTurno(
  repo: TurnoRepository,
  tenantId: string,
  nombre: string,
  teamlider: string,
  responsableId: string,
): Promise<Turno> {
  const activo = await repo.findActivo(tenantId);
  if (activo) throw new TurnoYaActivoError();
  return repo.create(tenantId, nombre, teamlider, responsableId);
}
