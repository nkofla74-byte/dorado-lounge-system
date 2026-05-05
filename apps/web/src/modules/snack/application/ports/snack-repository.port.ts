import type { DespachoSnack, TurnoActivo } from '../../domain/despacho-snack';
import type { StuartRequest } from '../../domain/stuart-request';

export interface SnackRepository {
  findDespachos(tenantId: string, turnoId?: string): Promise<DespachoSnack[]>;
  findTurnosActivos(tenantId: string): Promise<TurnoActivo[]>;
  findStuartRequests(tenantId: string, limit?: number): Promise<StuartRequest[]>;
  createStuartRequest(
    tenantId: string,
    input: { remitenteId: string; descripcion: string },
  ): Promise<StuartRequest>;
}
