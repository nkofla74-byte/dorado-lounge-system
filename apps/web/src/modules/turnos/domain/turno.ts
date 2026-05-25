import type { TurnoBloque } from '@dorado/shared-types';

export type { TurnoBloque };

export type TurnoCierreMotivo = 'manual' | 'auto_expiracion';

export interface Turno {
  id: string;
  tenantId: string;
  nombre: string;
  bloque: TurnoBloque | null;
  /**
   * Nombre del empleado real que abrió el turno (texto libre).
   * La columna SQL se llama `teamlider` por compatibilidad histórica.
   */
  teamlider: string;
  responsableId: string | null;
  iniciadoAt: Date;
  cerradoAt: Date | null;
  cierreMotivo: TurnoCierreMotivo | null;
  activo: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTurnoInput {
  bloque: TurnoBloque;
  teamlider: string;
}

export class TurnoYaActivoError extends Error {
  constructor() {
    super('Ya existe un turno activo. Ciérralo antes de iniciar uno nuevo.');
    this.name = 'TurnoYaActivoError';
  }
}

export class TurnoNoActivoError extends Error {
  constructor() {
    super('El turno ya está cerrado.');
    this.name = 'TurnoNoActivoError';
  }
}
