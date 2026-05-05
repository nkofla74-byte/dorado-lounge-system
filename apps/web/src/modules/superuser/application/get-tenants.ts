import type { SuperuserRepository } from './ports/superuser-repository.port';
import type { Tenant } from '../domain/superuser';

export async function getTenants(repo: SuperuserRepository): Promise<Tenant[]> {
  return repo.listTenants();
}

export async function getTenant(
  repo: SuperuserRepository,
  tenantId: string,
): Promise<Tenant | null> {
  return repo.getTenant(tenantId);
}
