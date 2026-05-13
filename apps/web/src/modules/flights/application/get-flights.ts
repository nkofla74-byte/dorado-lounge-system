import type { FlightsProvider } from './ports/flights-provider.port';
import type { Flight, FlightsQuery } from '../domain/flight';

export async function getFlights(
  provider: FlightsProvider,
  query: FlightsQuery,
): Promise<Flight[]> {
  const flights = await provider.getFlights(query);
  // Ordenar por hora efectiva ascendente
  return flights.sort((a, b) => {
    const tA = (a.estimatedTime ?? a.scheduledTime).getTime();
    const tB = (b.estimatedTime ?? b.scheduledTime).getTime();
    return tA - tB;
  });
}
