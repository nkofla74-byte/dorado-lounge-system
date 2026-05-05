import type { SnackRepository } from './ports/snack-repository.port';
import type { StuartRequest } from '../domain/stuart-request';

export async function getStuartRequests(
  repo: SnackRepository,
  tenantId: string,
  limit = 20,
): Promise<StuartRequest[]> {
  return repo.findStuartRequests(tenantId, limit);
}
