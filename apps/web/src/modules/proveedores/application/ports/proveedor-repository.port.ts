import type { Proveedor, CreateProveedorInput, UpdateProveedorInput } from '../../domain/proveedor';
import type { Lote } from '@/modules/inventory/utilities';

// tenantId=null → operación sin filtro (vista global / acción cross-tenant,
// solo para superuser; la validación de rol ocurre en la action).
export interface ProveedorRepository {
  findAll(tenantId: string | null): Promise<Proveedor[]>;
  findById(id: string, tenantId: string | null): Promise<Proveedor | null>;
  create(tenantId: string, input: CreateProveedorInput): Promise<Proveedor>;
  update(id: string, tenantId: string | null, input: UpdateProveedorInput): Promise<Proveedor>;
  findLotesByProveedor(proveedorId: string, tenantId: string | null): Promise<LoteConInsumo[]>;
}

export interface LoteConInsumo extends Lote {
  insumoNombre: string;
  proveedorNombre: string | null;
}
