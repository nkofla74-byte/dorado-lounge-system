import type { ProveedorRepository } from './ports/proveedor-repository.port';
import type { Proveedor } from '../domain/proveedor';

export async function getProveedores(
  repo: ProveedorRepository,
  tenantId: string,
): Promise<Proveedor[]> {
  return repo.findAll(tenantId);
}
