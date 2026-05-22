import { ProveedorNotFoundError, ProveedorEnUsoError } from '../domain/proveedor';
import type { ProveedorRepository } from './ports/proveedor-repository.port';

// Borra (soft) un proveedor. Bloquea si tiene lotes activos: el historial de
// compras debe mantenerse íntegro y el FK proveedor_id en lotes apunta acá.
// Si tenantId=null la action ya validó que el llamante es superuser.
export async function deleteProveedor(
  repo: ProveedorRepository,
  id: string,
  tenantId: string | null,
): Promise<void> {
  const existing = await repo.findById(id, tenantId);
  if (!existing) throw new ProveedorNotFoundError();

  const lotesActivos = await repo.countActiveLotes(id, tenantId);
  if (lotesActivos > 0) throw new ProveedorEnUsoError(lotesActivos);

  await repo.softDelete(id, tenantId);
}
