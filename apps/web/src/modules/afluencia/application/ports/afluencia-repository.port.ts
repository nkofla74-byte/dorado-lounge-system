import type { AfluenciaIngreso, RegistrarIngresoInput } from '../../domain/afluencia';
import type { TurnoBloque } from '@dorado/shared-types';

export interface AfluenciaRepository {
  findByTurno(tenantId: string, turnoId: string): Promise<AfluenciaIngreso[]>;
  getTotalByTurno(tenantId: string, turnoId: string): Promise<number>;
  /** Ingresos del bloque actual del día (suma de todos los turnos del bloque). */
  findByBloqueHoy(tenantId: string, bloque: TurnoBloque): Promise<AfluenciaIngreso[]>;
  getTotalByBloqueHoy(tenantId: string, bloque: TurnoBloque): Promise<number>;
  create(
    tenantId: string,
    registradoPor: string,
    input: RegistrarIngresoInput,
  ): Promise<AfluenciaIngreso>;
}
