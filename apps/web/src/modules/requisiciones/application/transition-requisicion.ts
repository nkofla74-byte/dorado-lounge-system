import { AppError } from '@/lib/result';
import { puedeTransicionar } from '../domain/requisicion';
import type { RequisicionRepository } from './ports/requisicion-repository.port';
import type { EstadoRequisicion, Requisicion } from '../domain/requisicion';

export async function transitionRequisicion(
  repo: RequisicionRepository,
  id: string,
  tenantId: string,
  actorId: string,
  estadoNuevo: EstadoRequisicion,
  version: number,
): Promise<Requisicion> {
  const actual = await repo.findById(id, tenantId);
  if (!actual) {
    throw new AppError('NOT_FOUND', 404, 'Requisición no encontrada');
  }
  if (!puedeTransicionar(actual.estado, estadoNuevo)) {
    throw new AppError(
      'INVALID_TRANSITION',
      400,
      `No se puede pasar de '${actual.estado}' a '${estadoNuevo}'`,
    );
  }
  return repo.transition(id, tenantId, actorId, estadoNuevo, version);
}
