// Modelo F3: merma aplicada en recepción (stock neto); consumo descuenta cantidades netas directas.
export interface DescuentoInsumo {
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  idempotencyKey: string;
}

interface ItemEntrega {
  id: string;
  cantidad: number;
  recetaPorciones: number;
  // Tipo de la receta del ítem. Las elaboraciones (produccion) ya descontaron
  // su FEFO al completar la tanda (fn_completar_tanda) — la entrega solo
  // registra trazabilidad. Descontar aquí sería doble descuento.
  recetaTipo: 'produccion' | 'servicio';
  ingredientes: { insumoId: string; insumoNombre: string; cantidadPorBatch: number }[];
}

export function calcularDescuentosPedido(
  pedidoId: string,
  items: ItemEntrega[],
): DescuentoInsumo[] {
  return items
    .filter((item) => item.recetaTipo !== 'produccion')
    .flatMap((item) =>
      item.ingredientes.map((ing) => ({
        insumoId: ing.insumoId,
        insumoNombre: ing.insumoNombre,
        cantidad: (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad,
        idempotencyKey: `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`,
      })),
    );
}
