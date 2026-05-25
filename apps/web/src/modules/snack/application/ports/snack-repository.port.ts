import type { DespachoSnack, TurnoActivo } from '../../domain/despacho-snack';
import type { StuartRequest } from '../../domain/stuart-request';
import type { SolicitudPreparacion } from '../../domain/solicitud-preparacion';

export interface SnackRepository {
  findDespachos(tenantId: string, turnoId?: string): Promise<DespachoSnack[]>;
  findTurnosActivos(tenantId: string): Promise<TurnoActivo[]>;
  findStuartRequests(tenantId: string, limit?: number): Promise<StuartRequest[]>;
  createStuartRequest(
    tenantId: string,
    input: { remitenteId: string; descripcion: string },
  ): Promise<StuartRequest>;
  findSolicitudesPreparacion(tenantId: string, limit?: number): Promise<SolicitudPreparacion[]>;
  createSolicitudPreparacion(
    tenantId: string,
    input: { remitenteId: string; descripcion: string; canal?: string },
  ): Promise<SolicitudPreparacion>;
}
