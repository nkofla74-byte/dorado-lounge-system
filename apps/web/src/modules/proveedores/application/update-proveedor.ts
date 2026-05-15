import type { ProveedorRepository } from './ports/proveedor-repository.port';
import type { UpdateProveedorInput, Proveedor } from '../domain/proveedor';
import { ProveedorNotFoundError } from '../domain/proveedor';

export async function updateProveedor(
  repo: ProveedorRepository,
  id: string,
  tenantId: string,
  input: UpdateProveedorInput,
): Promise<Proveedor> {
  const existing = await repo.findById(id, tenantId);
  if (!existing) throw new ProveedorNotFoundError();
  return repo.update(id, tenantId, input);
}
