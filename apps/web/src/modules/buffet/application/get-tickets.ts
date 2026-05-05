import type { BuffetRepository } from './ports/buffet-repository.port';
import type { TicketTurno } from '../domain/ticket-turno';

export async function getTicketsByTurno(
  repo: BuffetRepository,
  tenantId: string,
  turnoId: string,
): Promise<TicketTurno[]> {
  return repo.findTicketsByTurno(tenantId, turnoId);
}
