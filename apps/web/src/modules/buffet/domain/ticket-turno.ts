export interface TicketTurno {
  id: string;
  tenantId: string;
  turnoId: string;
  turnoNombre: string;
  cantidadTickets: number;
  registradoPor: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface TurnoActivo {
  id: string;
  nombre: string;
  activo: boolean;
  iniciadoAt: Date;
}

export interface CreateTicketsTurnoInput {
  turnoId: string;
  cantidadTickets: number;
  idempotencyKey: string;
}
