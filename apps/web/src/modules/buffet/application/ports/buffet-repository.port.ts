import type {
  DespachoBuffet,
  RecetaServicioBuffet,
  CreateDespachoBuffetInput,
} from '../../domain/despacho-buffet';
import type { TicketTurno, TurnoActivo, CreateTicketsTurnoInput } from '../../domain/ticket-turno';

export interface BuffetRepository {
  findDespachos(tenantId: string, turnoId?: string): Promise<DespachoBuffet[]>;
  findRecetaServicioBuffet(
    recetaId: string,
    tenantId: string,
  ): Promise<RecetaServicioBuffet | null>;
  createDespacho(
    tenantId: string,
    input: CreateDespachoBuffetInput & { responsableId: string },
  ): Promise<DespachoBuffet>;
  findTicketsByTurno(tenantId: string, turnoId: string): Promise<TicketTurno[]>;
  createTickets(
    tenantId: string,
    input: CreateTicketsTurnoInput & { registradoPor: string },
  ): Promise<TicketTurno>;
  findTurnosActivos(tenantId: string): Promise<TurnoActivo[]>;
  findRecetasServicioBuffet(
    tenantId: string,
  ): Promise<Pick<RecetaServicioBuffet, 'id' | 'nombre' | 'porciones'>[]>;
}
