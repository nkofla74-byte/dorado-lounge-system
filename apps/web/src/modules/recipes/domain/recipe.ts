import type {
  TipoReceta,
  ZonaServicio,
  AreaProduccion,
  CategoriaMenu,
  UnidadMedida,
} from '@dorado/shared-types';

export interface Receta {
  id: string;
  tenantId: string;
  nombre: string;
  tipoReceta: TipoReceta;
  zona: ZonaServicio | null;
  insumoDestinoId: string | null;
  areaProduccion: AreaProduccion | null;
  porciones: number;
  /**
   * Cuánto produce UNA tanda, en la unidad del insumo destino. Solo tiene valor
   * en recetas de producción, donde la base de datos lo exige: sin él no se
   * puede crear el lote del elaborado, que era el agujero de F-037.
   */
  rendimientoCantidad: number | null;
  categoriaMenu: CategoriaMenu | null;
  descripcion: string | null;
  imagenUrl: string | null;
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
  unidadDisplay: UnidadMedida | null;
  mermaCoeficiente: number;
}

export interface RecetaWithIngredientes extends Receta {
  ingredientes: RecetaIngrediente[];
  insumoDestinoNombre: string | null;
}

export interface RecipeIngredientInput {
  insumoId: string;
  cantidad: number;
  unidad?: UnidadMedida | undefined;
  mermaCoeficiente: number;
}

export type CreateRecetaInput =
  | {
      tipoReceta: 'produccion';
      nombre: string;
      insumoDestinoId: string;
      porciones: number;
      /** Rendimiento NETO por tanda, en la unidad del insumo destino. */
      rendimientoCantidad: number;
      descripcion?: string | null | undefined;
      ingredientes?: RecipeIngredientInput[] | undefined;
    }
  | {
      tipoReceta: 'servicio';
      nombre: string;
      zona: ZonaServicio;
      porciones: number;
      descripcion?: string | null | undefined;
      categoriaMenu?: CategoriaMenu | null | undefined;
      ingredientes?: RecipeIngredientInput[] | undefined;
    };

export interface AddIngredienteInput {
  recetaId: string;
  insumoId: string;
  cantidad: number;
  unidadDisplay: UnidadMedida | null;
  mermaCoeficiente: number;
}

export interface UpdateMenuMetaInput {
  recetaId: string;
  categoriaMenu: CategoriaMenu | null;
  descripcion: string | null;
  imagenUrl: string | null;
}
