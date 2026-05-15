export interface CostoIngrediente {
  insumoId: string;
  insumoNombre: string;
  unidadMedida: string;
  cantidad: number;
  mermaCoeficiente: number;
  cantidadBruta: number;
  precioUnitario: number | null;
  costoIngrediente: number | null;
}

export interface CostoReceta {
  recetaId: string;
  porciones: number;
  costoTotal: number;
  costoPorPorcion: number | null;
  tieneCostoCompleto: boolean;
  ingredientes: CostoIngrediente[];
}
