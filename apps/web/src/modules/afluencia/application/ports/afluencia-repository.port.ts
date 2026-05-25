import type { AfluenciaIngreso, RegistrarIngresoInput } from '../../domain/afluencia';
import type { PasajeroIngreso, RegistrarPasajeroInput } from '../../domain/pasajero-ingreso';
import type { TurnoBloque } from '@dorado/shared-types';

export interface AfluenciaRepository {
  findByTurno(tenantId: string, turnoId: string): Promise<AfluenciaIngreso[]>;
  getTotalByTurno(tenantId: string, turnoId: string): Promise<number>;
  findByBloqueHoy(tenantId: string, bloque: TurnoBloque): Promise<AfluenciaIngreso[]>;
  getTotalByBloqueHoy(tenantId: string, bloque: TurnoBloque): Promise<number>;
  create(
    tenantId: string,
    registradoPor: string,
    input: RegistrarIngresoInput,
  ): Promise<AfluenciaIngreso>;

  // Registro individual de pasajeros
  findPasajerosByTurno(tenantId: string, turnoId: string): Promise<PasajeroIngreso[]>;
  getTotalPasajerosByTurno(tenantId: string, turnoId: string): Promise<number>;
  createPasajero(
    tenantId: string,
    registradoPor: string,
    input: RegistrarPasajeroInput,
  ): Promise<PasajeroIngreso>;
}
