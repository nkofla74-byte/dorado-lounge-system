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
