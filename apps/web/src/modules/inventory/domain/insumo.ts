import type { CapaInventario, UnidadMedida } from '@dorado/shared-types';

export interface Insumo {
  id: string;
  tenantId: string;
  nombre: string;
  codigo?: string | null;
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
  cantidadInicial: number;
  cantidadActual: number;
  fechaRecibido: string;
  fechaVencimiento: string | null;
  proveedor: string | null;
  costoUnitario: number | null;
  activo: boolean;
  createdAt: Date;
}

export type CreateLoteInput = {
  insumoId: string;
  cantidadInicial: number;
  fechaVencimiento?: string | undefined;
  proveedor?: string | undefined;
  costoUnitario?: number | undefined;
};
