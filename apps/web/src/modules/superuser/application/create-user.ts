import type { SuperuserRepository, CreateUserInput } from './ports/superuser-repository.port';
import type { TenantUser } from '../domain/superuser';

export async function createUser(
  repo: SuperuserRepository,
  input: CreateUserInput,
): Promise<TenantUser> {
  return repo.createUser(input);
}
