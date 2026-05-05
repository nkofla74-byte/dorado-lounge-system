import type { SuperuserRepository } from './ports/superuser-repository.port';
import type { TenantUser } from '../domain/superuser';

export async function getUsers(
  repo: SuperuserRepository,
  tenantId?: string,
): Promise<TenantUser[]> {
  return repo.listUsers(tenantId);
}
