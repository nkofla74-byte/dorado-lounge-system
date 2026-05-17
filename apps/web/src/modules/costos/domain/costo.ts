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

/**
 * Mapea la fila cruda devuelta por la RPC `fn_costo_receta`
 * (snake_case, numeric como string) al dominio (camelCase, number).
 */
export function costoRecetaFromRpcRow(raw: Record<string, unknown>): CostoReceta {
  const rawIngredientes = Array.isArray(raw.ingredientes) ? raw.ingredientes : [];
  const ingredientes = rawIngredientes.map((item) => {
    const i = item as Record<string, unknown>;
    return {
      insumoId: i.insumo_id as string,
      insumoNombre: i.insumo_nombre as string,
      unidadMedida: i.unidad_medida as string,
      cantidad: Number(i.cantidad),
      mermaCoeficiente: Number(i.merma_coeficiente),
      cantidadBruta: Number(i.cantidad_bruta),
      precioUnitario: i.precio_unitario != null ? Number(i.precio_unitario) : null,
      costoIngrediente: i.costo_ingrediente != null ? Number(i.costo_ingrediente) : null,
    } satisfies CostoIngrediente;
  });

  return {
    recetaId: raw.receta_id as string,
    porciones: Number(raw.porciones),
    costoTotal: Number(raw.costo_total ?? 0),
    costoPorPorcion: raw.costo_por_porcion != null ? Number(raw.costo_por_porcion) : null,
    tieneCostoCompleto: raw.tiene_costo_completo as boolean,
    ingredientes,
  };
}
