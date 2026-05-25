import type { Turno, TurnoBloque } from '../../domain/turno';

export interface TurnoRepository {
  findAll(tenantId: string): Promise<Turno[]>;
  /**
   * @deprecated Usar findActivoByUser. Con múltiples turnos activos
   * a la vez por bloque, devuelve uno arbitrario.
   */
  findActivo(tenantId: string): Promise<Turno | null>;
  findActivoByUser(tenantId: string, responsableId: string): Promise<Turno | null>;
  findActivosEnBloque(tenantId: string, bloque: TurnoBloque): Promise<Turno[]>;
  create(
    tenantId: string,
    bloque: TurnoBloque,
    teamlider: string,
    responsableId: string,
  ): Promise<Turno>;
  cerrar(turnoId: string, tenantId: string): Promise<Turno>;
}
