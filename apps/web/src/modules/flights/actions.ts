'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { createAviationStackProvider } from './infrastructure/aviationstack-provider';
import { getFlights as getFlightsUseCase } from './application/get-flights';
import type { Result } from '@/lib/result';
import type { Flight, FlightDirection } from './domain/flight';

const AIRPORT_IATA = 'BOG'; // El Dorado, Bogotá

export async function getFlights(
  direction: FlightDirection,
  limit = 30,
): Promise<Result<Flight[]>> {
  try {
    await assertCan('flights:read');
    const provider = createAviationStackProvider();
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
