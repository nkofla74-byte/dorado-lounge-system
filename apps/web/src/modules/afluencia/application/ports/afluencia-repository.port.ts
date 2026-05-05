import type { AfluenciaIngreso, RegistrarIngresoInput } from '../../domain/afluencia';

export interface AfluenciaRepository {
  findByTurno(tenantId: string, turnoId: string): Promise<AfluenciaIngreso[]>;
  getTotalByTurno(tenantId: string, turnoId: string): Promise<number>;
  create(
    tenantId: string,
    registradoPor: string,
    input: RegistrarIngresoInput,
  ): Promise<AfluenciaIngreso>;
}
