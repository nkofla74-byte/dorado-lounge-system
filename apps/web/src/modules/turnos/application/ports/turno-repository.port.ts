import type { Turno } from '../../domain/turno';

export interface TurnoRepository {
  findAll(tenantId: string): Promise<Turno[]>;
  findActivo(tenantId: string): Promise<Turno | null>;
  create(tenantId: string, nombre: string, responsableId: string): Promise<Turno>;
  cerrar(turnoId: string, tenantId: string): Promise<Turno>;
}
