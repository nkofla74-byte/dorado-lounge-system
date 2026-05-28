import { AppError } from '@/lib/result';
import type { OrderRepository } from './ports/order-repository.port';
import type { PedidoWithItems, CreatePedidoInput, AreaProduccion } from '../domain/pedido';
import { rutearPedido, type ItemRuteable } from '../domain/routing';

export async function createPedido(
  repo: OrderRepository,
  tenantId: string,
  userId: string,
  input: CreatePedidoInput,
): Promise<PedidoWithItems> {
  const recetaIds = [...new Set(input.items.map((i) => i.recetaId))];
  const areas = await repo.findRecetaAreas(tenantId, recetaIds);

  const ruteables: ItemRuteable[] = input.items.map((i) => ({
    recetaId: i.recetaId,
    areaProduccion: areas[i.recetaId] ?? null,
  }));
  const ruteo = rutearPedido(input.zona, ruteables);

  if (ruteo.itemsSinArea.length > 0) {
    throw new AppError(
      'RECETA_SIN_AREA',
      400,
      `Recetas sin área de producción asignada: ${ruteo.itemsSinArea.join(', ')}`,
    );
  }
  if (ruteo.areasNoPermitidas.length > 0) {
    throw new AppError(
      'AREA_NO_PERMITIDA',
      422,
      `La zona ${input.zona} no puede solicitar producción a: ${ruteo.areasNoPermitidas.join(', ')}`,
    );
  }

  const itemAreas: Record<string, AreaProduccion> = {};
  for (const r of ruteables) {
    if (r.areaProduccion !== null) itemAreas[r.recetaId] = r.areaProduccion;
  }

  return repo.create(tenantId, userId, input, itemAreas);
}
