import type { RequisicionRepository } from './ports/requisicion-repository.port';
import type { CreateRequisicionInput, RequisicionWithItems } from '../domain/requisicion';

export async function createRequisicion(
  repo: RequisicionRepository,
  tenantId: string,
  userId: string,
  input: CreateRequisicionInput,
): Promise<RequisicionWithItems> {
  return repo.create(tenantId, userId, input);
}
