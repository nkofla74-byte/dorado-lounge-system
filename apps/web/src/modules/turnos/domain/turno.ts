export interface Turno {
  id: string;
  tenantId: string;
  nombre: string;
  teamlider: string;
  responsableId: string | null;
  iniciadoAt: Date;
  cerradoAt: Date | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTurnoInput {
  nombre: string;
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
