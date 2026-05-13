import type { Flight, FlightsQuery } from '../../domain/flight';

export interface FlightsProvider {
  getFlights(query: FlightsQuery): Promise<Flight[]>;
}
