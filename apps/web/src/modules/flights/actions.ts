'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { createAeroDataBoxProvider } from './infrastructure/aerodatabox-provider';
import { createFlightRepository } from './infrastructure/flight-repository';
import { getFlights as getFlightsUseCase } from './application/get-flights';
import { getFlightStats as getFlightStatsUseCase } from './application/get-flight-stats';
import { getForecast as getForecastUseCase } from './application/get-forecast';
import type { Result } from '@/lib/result';
import type { Flight, FlightDirection, FlightStats } from './domain/flight';
import type { ForecastResult } from './domain/forecast';

const AIRPORT_IATA = 'BOG'; // El Dorado, Bogotá

export async function getFlights(
  direction: FlightDirection,
  limit = 30,
): Promise<Result<Flight[]>> {
  try {
    await assertCan('flights:read');
    const provider = createAeroDataBoxProvider();
    const flights = await getFlightsUseCase(provider, {
      direction,
      airportIata: AIRPORT_IATA,
      limit,
    });
    return ok(flights);
  } catch (e) {
    return err(toAppError(e));
  }
}

// Estadísticas históricas — solo admin y recepción.
export async function getFlightStats(): Promise<Result<FlightStats>> {
  try {
    const ctx = await assertCan('flights:stats:read');
    const repo = createFlightRepository();
    const stats = await getFlightStatsUseCase(repo, ctx.tenantId);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'flights:stats:read',
      resourceType: 'flight_stats',
      payload: { dias: stats.ultimos7d.length },
    });

    return ok(stats);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getForecastForDate(fecha: string): Promise<Result<ForecastResult>> {
  try {
    const ctx = await assertCan('flights:stats:read');
    const repo = createFlightRepository();
    const forecast = await getForecastUseCase(repo, ctx.tenantId, fecha);
    return ok(forecast);
  } catch (e) {
    return err(toAppError(e));
  }
}
