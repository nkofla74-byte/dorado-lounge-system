import type { EstadoRequisicion, AreaSolicitante, UnidadMedida } from '@dorado/shared-types';
import { REQUISICION_TRANSITIONS } from '@dorado/shared-types';

export type { EstadoRequisicion, AreaSolicitante };
export { REQUISICION_TRANSITIONS };

export interface RequisicionItem {
  id: string;
  requisicionId: string;
  insumoId: string;
  insumoNombre: string;
  cantidadSolicitada: number;
  cantidadDespachada: number;
  unidad: UnidadMedida;
}

export interface Requisicion {
  id: string;
  tenantId: string;
  areaSolicitante: AreaSolicitante;
  solicitadaPor: string | null;
  turnoId: string | null;
  estado: EstadoRequisicion;
  notas: string | null;
  version: number;
  solicitadaAt: Date;
  alistamientoAt: Date | null;
  despachadaAt: Date | null;
  recibidaAt: Date | null;
  canceladaAt: Date | null;
  createdAt: Date;
}

export interface RequisicionWithItems extends Requisicion {
  items: RequisicionItem[];
}

export type CreateRequisicionInput = {
  areaSolicitante: AreaSolicitante;
  idempotencyKey: string;
  notas?: string | undefined;
  turnoId?: string | undefined;
  items: Array<{ insumoId: string; cantidadSolicitada: number; unidad: UnidadMedida }>;
};

export type DespachoItemInput = { itemId: string; cantidadDespachada: number };

// Regla pura: ¿es legal pasar de `desde` a `hacia`?
export function puedeTransicionar(desde: EstadoRequisicion, hacia: EstadoRequisicion): boolean {
  return REQUISICION_TRANSITIONS[desde].includes(hacia);
}
