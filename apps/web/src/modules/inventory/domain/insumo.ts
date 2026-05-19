import type { CapaInventario, UnidadMedida } from '@dorado/shared-types';

export interface Insumo {
  id: string;
  tenantId: string;
  nombre: string;
  codigo: string;
  capa: CapaInventario;
  unidadMedida: UnidadMedida;
  stockMinimo: number;
  activo: boolean;
  createdAt: Date;
}

export interface InsumoWithStock extends Insumo {
  stockActual: number;
}

export interface CreateInsumoInput {
  nombre: string;
  codigo?: string | null;
  capa: CapaInventario;
  unidadMedida: UnidadMedida;
  stockMinimo: number;
}

export interface Lote {
  id: string;
  tenantId: string;
  insumoId: string;
  codigo: string;
  cantidadInicial: number;
  cantidadActual: number;
  fechaRecibido: string;
  fechaVencimiento: string | null;
  proveedor: string | null;
  proveedorId: string | null;
  costoUnitario: number | null;
  cantidadEmpaques: number | null;
  pesoUnitario: number | null;
  unidadPeso: UnidadMedida | null;
  activo: boolean;
  createdAt: Date;
}

export type CreateLoteInput = {
  insumoId: string;
  cantidadInicial: number;
  fechaVencimiento?: string | undefined;
  proveedor?: string | undefined;
  proveedorId?: string | undefined;
  costoUnitario?: number | undefined;
  cantidadEmpaques?: number | undefined;
  pesoUnitario?: number | undefined;
  unidadPeso?: UnidadMedida | undefined;
};
