import type { Flight, FlightStats, OcupacionDiaria } from '../../domain/flight';
import type { FlightForecastInput } from '../../domain/forecast';

export interface FlightsRepository {
  upsertSnapshots(tenantId: string, flights: Flight[]): Promise<number>;
  refreshOcupacionDiaria(): Promise<void>;
  getOcupacionUltimos7d(tenantId: string): Promise<OcupacionDiaria[]>;
  getTopAerolineas(tenantId: string, dias: number): Promise<FlightStats['topAerolineas']>;
  getDeparturesForDate(tenantId: string, fecha: string): Promise<FlightForecastInput[]>;
}
