import type { EstadoTanda, ZonaServicio } from '@dorado/shared-types';

export type { EstadoTanda, ZonaServicio };

export interface Tanda {
  id: string;
  tenantId: string;
  recetaId: string;
  recetaNombre: string;
  cantidadTandas: number;
  estado: EstadoTanda;
  zonaDestino: ZonaServicio | null;
  pedidoItemId: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  turnoId: string | null;
  turnoNombre: string | null;
  notas: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TandaIngrediente {
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  mermaCoeficiente: number;
}

export interface TandaWithIngredientes extends Tanda {
  ingredientes: TandaIngrediente[];
}

export interface CreateTandaInput {
  recetaId: string;
  cantidadTandas: number;
  zonaDestino: ZonaServicio;
  pedidoItemId?: string | null;
  notas?: string | null;
  responsableId?: string | null;
  turnoId?: string | null;
  idempotencyKey: string;
}

export const TANDA_TRANSITIONS: Record<EstadoTanda, EstadoTanda[]> = {
  planificada: ['en_proceso', 'cancelada'],
  en_proceso: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
};
