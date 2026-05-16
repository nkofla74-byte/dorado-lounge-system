import type { Proveedor, CreateProveedorInput, UpdateProveedorInput } from '../../domain/proveedor';
import type { Lote } from '@/modules/inventory/utilities';

export interface ProveedorRepository {
  findAll(tenantId: string): Promise<Proveedor[]>;
  findById(id: string, tenantId: string): Promise<Proveedor | null>;
  create(tenantId: string, input: CreateProveedorInput): Promise<Proveedor>;
  update(id: string, tenantId: string, input: UpdateProveedorInput): Promise<Proveedor>;
  findLotesByProveedor(proveedorId: string, tenantId: string): Promise<LoteConInsumo[]>;
}

export interface LoteConInsumo extends Lote {
  insumoNombre: string;
  proveedorNombre: string | null;
}
