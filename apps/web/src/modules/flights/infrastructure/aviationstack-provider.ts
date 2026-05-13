import type { FlightsProvider } from '../application/ports/flights-provider.port';
import type { Flight, FlightsQuery, FlightStatus } from '../domain/flight';
import { AppError } from '@/lib/result';

// Forma de los datos que devuelve AviationStack v1/flights
interface ASEndpoint {
  iata: string | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  gate: string | null;
  terminal: string | null;
}

interface ASFlight {
  flight_status: string;
  flight: { iata: string | null };
  airline: { name: string | null };
  departure: ASEndpoint;
  arrival: ASEndpoint;
}

interface ASResponse {
  data?: ASFlight[];
  error?: { message: string };
}

function mapStatus(raw: string): FlightStatus {
  const map: Record<string, FlightStatus> = {
    scheduled: 'scheduled',
    active: 'active',
    landed: 'landed',
    cancelled: 'cancelled',
    diverted: 'diverted',
    incident: 'unknown',
  };
  return map[raw] ?? 'unknown';
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function createAviationStackProvider(): FlightsProvider {
  return {
    async getFlights(query: FlightsQuery): Promise<Flight[]> {
      const apiUrl = process.env['FLIGHTS_API_URL'];
      const apiKey = process.env['FLIGHTS_API_KEY'];

      // Sin credenciales → devolver lista vacía (feature no configurada)
      if (!apiUrl || !apiKey) return [];

      const isDeparture = query.direction === 'departure';
      const params = new URLSearchParams({
        access_key: apiKey,
        [isDeparture ? 'dep_iata' : 'arr_iata']: query.airportIata,
        limit: String(query.limit ?? 30),
      });

      const res = await fetch(`${apiUrl}/flights?${params.toString()}`, {
        next: { revalidate: 60 }, // caché server-side 60 s
      });

      if (!res.ok) {
        throw new AppError('FLIGHTS_API_ERROR', 502, `AviationStack HTTP ${res.status}`);
      }

      const json: ASResponse = await res.json();
      if (json.error) {
        throw new AppError('FLIGHTS_API_ERROR', 502, json.error.message);
      }

      return (json.data ?? []).map((f): Flight => {
        const dep = f.departure;
        const arr = f.arrival;
        const scheduled = parseDate(isDeparture ? dep.scheduled : arr.scheduled);

        return {
          flightNumber: f.flight.iata ?? '—',
          airline: f.airline.name ?? '—',
          origin: dep.iata ?? '—',
          destination: arr.iata ?? '—',
          scheduledTime: scheduled ?? new Date(),
          estimatedTime: parseDate(isDeparture ? dep.estimated : arr.estimated),
          actualTime: parseDate(isDeparture ? dep.actual : arr.actual),
          status: mapStatus(f.flight_status),
          gate: (isDeparture ? dep.gate : arr.gate) ?? null,
          terminal: (isDeparture ? dep.terminal : arr.terminal) ?? null,
          direction: query.direction,
        };
      });
    },
  };
}
