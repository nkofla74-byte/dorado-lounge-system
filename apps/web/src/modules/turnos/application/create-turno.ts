import type { TurnoRepository } from './ports/turno-repository.port';
import type { Turno, TurnoBloque } from '../domain/turno';
import { TurnoYaActivoError } from '../domain/turno';

export async function createTurno(
  repo: TurnoRepository,
  tenantId: string,
  bloque: TurnoBloque,
  teamlider: string,
  responsableId: string,
): Promise<Turno> {
  const activo = await repo.findActivoByUser(tenantId, responsableId);
  if (activo) throw new TurnoYaActivoError();
  return repo.create(tenantId, bloque, teamlider, responsableId);
}
