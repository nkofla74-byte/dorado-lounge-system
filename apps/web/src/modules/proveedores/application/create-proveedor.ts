import type { ProveedorRepository } from './ports/proveedor-repository.port';
import type { CreateProveedorInput, Proveedor } from '../domain/proveedor';

export async function createProveedor(
  repo: ProveedorRepository,
  tenantId: string,
  input: CreateProveedorInput,
): Promise<Proveedor> {
  return repo.create(tenantId, input);
}
