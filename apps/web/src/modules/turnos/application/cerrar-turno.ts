import type { TurnoRepository } from './ports/turno-repository.port';
import type { Turno } from '../domain/turno';
import { TurnoNoActivoError } from '../domain/turno';

export async function cerrarTurno(
  repo: TurnoRepository,
  turnoId: string,
  tenantId: string,
  responsableId: string,
): Promise<Turno> {
  const turno = await repo.findActivoByUser(tenantId, responsableId);
  if (!turno || turno.id !== turnoId) throw new TurnoNoActivoError();
  return repo.cerrar(turnoId, tenantId);
}
