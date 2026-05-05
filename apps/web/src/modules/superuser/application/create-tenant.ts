import { validarSlug } from '../domain/superuser';
import type { SuperuserRepository } from './ports/superuser-repository.port';
import type { Tenant } from '../domain/superuser';

export async function createTenant(
  repo: SuperuserRepository,
  nombre: string,
  slug: string,
): Promise<Tenant> {
  validarSlug(slug);
  return repo.createTenant(nombre, slug);
}
