import type { ProductionRepository } from './ports/production-repository.port';
import type { Tanda, ZonaServicio } from '../domain/tanda';

// Disponibilidad para zonas de origen: tandas completadas en las últimas 24h
// con destino a la zona. La zona consulta qué hay producido antes de pedir.
const VENTANA_HORAS = 24;

export async function getTandasDisponibles(
  repo: ProductionRepository,
  tenantId: string,
  zona: ZonaServicio,
): Promise<Tanda[]> {
  return repo.findCompletadasByZona(tenantId, zona, VENTANA_HORAS);
}
