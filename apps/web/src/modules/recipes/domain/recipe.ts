import type { TipoReceta, ZonaServicio, AreaProduccion } from '@dorado/shared-types';

export interface Receta {
  id: string;
  tenantId: string;
  nombre: string;
  tipoReceta: TipoReceta;
  zona: ZonaServicio | null;
  insumoDestinoId: string | null;
  areaProduccion: AreaProduccion | null;
  porciones: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecetaIngrediente {
  id: string;
  recetaId: string;
  insumoId: string;
  insumoNombre: string;
  unidadMedida: string;
  cantidad: number;
  mermaCoeficiente: number;
}

export interface RecetaWithIngredientes extends Receta {
  ingredientes: RecetaIngrediente[];
  insumoDestinoNombre: string | null;
}

export type CreateRecetaInput =
  | {
      tipoReceta: 'produccion';
      nombre: string;
      insumoDestinoId: string;
      porciones: number;
    }
  | {
      tipoReceta: 'servicio';
      nombre: string;
      zona: ZonaServicio;
      porciones: number;
    };

export interface AddIngredienteInput {
  recetaId: string;
  insumoId: string;
  cantidad: number;
  mermaCoeficiente: number;
}
