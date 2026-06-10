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
  ingredientes: { insumoId: string; insumoNombre: string; cantidadPorBatch: number }[];
}

export function calcularDescuentosPedido(
  pedidoId: string,
  items: ItemEntrega[],
): DescuentoInsumo[] {
  return items.flatMap((item) =>
    item.ingredientes.map((ing) => ({
      insumoId: ing.insumoId,
      insumoNombre: ing.insumoNombre,
      cantidad: (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad,
      idempotencyKey: `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`,
    })),
  );
}
