import type { Flight, FlightStats, OcupacionDiaria } from '../../domain/flight';

export interface FlightsRepository {
  // Persiste un lote de vuelos para un tenant. UPSERT por PK natural.
  // Devuelve cuántas filas se insertaron/actualizaron.
  upsertSnapshots(tenantId: string, flights: Flight[]): Promise<number>;

  // Refresca la vista materializada de ocupación diaria.
  refreshOcupacionDiaria(): Promise<void>;

  // Lecturas para el dashboard.
  getOcupacionUltimos7d(tenantId: string): Promise<OcupacionDiaria[]>;
  getTopAerolineas(tenantId: string, dias: number): Promise<FlightStats['topAerolineas']>;
}
