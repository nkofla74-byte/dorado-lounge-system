import type { AfluenciaRepository } from './ports/afluencia-repository.port';
import type { AfluenciaIngreso, RegistrarIngresoInput } from '../domain/afluencia';
import { validarIngreso } from '../domain/afluencia';

export async function registrarIngreso(
  repo: AfluenciaRepository,
  tenantId: string,
  registradoPor: string,
  input: RegistrarIngresoInput,
): Promise<AfluenciaIngreso> {
  validarIngreso(input);
  return repo.create(tenantId, registradoPor, input);
}
