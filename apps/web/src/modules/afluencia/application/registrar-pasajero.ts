import type { AfluenciaRepository } from './ports/afluencia-repository.port';
import type { PasajeroIngreso, RegistrarPasajeroInput } from '../domain/pasajero-ingreso';
import { validarPasajeroIngreso } from '../domain/pasajero-ingreso';

export async function registrarPasajero(
  repo: AfluenciaRepository,
  tenantId: string,
  registradoPor: string,
  input: RegistrarPasajeroInput,
): Promise<PasajeroIngreso> {
  validarPasajeroIngreso(input);
  return repo.createPasajero(tenantId, registradoPor, input);
}
