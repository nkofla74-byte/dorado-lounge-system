import { ZONA_AREAS_PERMITIDAS } from '@dorado/shared-types';
import type { AreaProduccion, ZonaServicio } from '@dorado/shared-types';

/**
 * ¿La zona de consumo puede solicitar producción a esta área?
 * Fuente de verdad: ZONA_AREAS_PERMITIDAS (shared-types).
 */
export function zonaPuedeSolicitar(zona: ZonaServicio, area: AreaProduccion): boolean {
  return ZONA_AREAS_PERMITIDAS[zona].includes(area);
}

export interface ItemRuteable {
  recetaId: string;
  /** Área que produce la receta del ítem (null si la receta no está clasificada). */
  areaProduccion: AreaProduccion | null;
}

export interface RuteoPedido {
  /** Áreas destino únicas del pedido (un pedido puede tocar varias). */
  areas: AreaProduccion[];
  /** recetaId de los ítems cuya receta no tiene área asignada. */
  itemsSinArea: string[];
  /** Áreas a las que la zona NO tiene permiso de solicitar (orden de aparición, sin duplicados). */
  areasNoPermitidas: AreaProduccion[];
}

/**
 * Calcula el ruteo de un pedido: agrupa los ítems por área destino y detecta
 * violaciones (ítems sin área, o áreas no permitidas para la zona origen).
 *
 * Puro: no lanza. La capa de aplicación decide si rechaza el pedido (AppError)
 * cuando `itemsSinArea` o `areasNoPermitidas` no están vacíos.
 */
export function rutearPedido(zona: ZonaServicio, items: ItemRuteable[]): RuteoPedido {
  const areas: AreaProduccion[] = [];
  const itemsSinArea: string[] = [];
  const areasNoPermitidas: AreaProduccion[] = [];

  for (const item of items) {
    if (item.areaProduccion === null) {
      itemsSinArea.push(item.recetaId);
      continue;
    }
    const area = item.areaProduccion;
    if (!zonaPuedeSolicitar(zona, area)) {
      if (!areasNoPermitidas.includes(area)) areasNoPermitidas.push(area);
      continue;
    }
    if (!areas.includes(area)) areas.push(area);
  }

  return { areas, itemsSinArea, areasNoPermitidas };
}
