import type { EstadoTanda } from '@dorado/shared-types';

export type { EstadoTanda };

export interface Tanda {
  id: string;
  tenantId: string;
  recetaId: string;
  recetaNombre: string;
  cantidadTandas: number;
  estado: EstadoTanda;
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
  notas?: string | null;
  idempotencyKey: string;
}

export const TANDA_TRANSITIONS: Record<EstadoTanda, EstadoTanda[]> = {
  planificada: ['en_proceso', 'cancelada'],
  en_proceso: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
};
