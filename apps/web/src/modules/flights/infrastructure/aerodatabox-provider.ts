import type { FlightsProvider } from '../application/ports/flights-provider.port';
import type { Flight, FlightsQuery, FlightStatus } from '../domain/flight';
import { AppError } from '@/lib/result';

interface ADBTime {
  utc?: string | null;
  local?: string | null;
}

interface ADBMovement {
  airport?: {
    icao?: string | null;
    iata?: string | null;
    name?: string | null;
  } | null;
  scheduledTime?: ADBTime | null;
  revisedTime?: ADBTime | null;
  terminal?: string | null;
  gate?: string | null;
  baggageBelt?: string | null;
}

interface ADBFlight {
  number?: string | null;
  status?: string | null;
  codeshareStatus?: string | null;
  isCargo?: boolean;
  airline?: { name?: string | null } | null;
  aircraft?: { model?: string | null; reg?: string | null } | null;
  movement?: ADBMovement | null;
}

interface ADBResponse {
  departures?: ADBFlight[];
  arrivals?: ADBFlight[];
  message?: string;
}

const IATA_TO_ICAO: Record<string, string> = { BOG: 'SKBO' };
const HOME_IATA = 'BOG';

function mapStatus(raw: string | null | undefined): FlightStatus {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower === 'scheduled' || lower === 'expected') return 'scheduled';
  if (lower === 'en route' || lower === 'airborne' || lower === 'departed') return 'active';
  if (lower === 'landed' || lower === 'arrived') return 'landed';
  if (lower === 'cancelled' || lower === 'canceled') return 'cancelled';
  if (lower === 'diverted') return 'diverted';
  return 'unknown';
}

function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function todayWindows(): Array<{ from: string; to: string }> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const base = `${y}-${m}-${d}`;
  return [
    { from: `${base}T00:00`, to: `${base}T11:59` },
    { from: `${base}T12:00`, to: `${base}T23:59` },
  ];
}

export function createAeroDataBoxProvider(): FlightsProvider {
  return {
    async getFlights(query: FlightsQuery): Promise<Flight[]> {
      const apiUrl = process.env['FLIGHTS_API_URL'];
      const apiKey = process.env['FLIGHTS_API_KEY'];

      if (!apiUrl || !apiKey) return [];

      const icao = IATA_TO_ICAO[query.airportIata] ?? query.airportIata;
      const isDeparture = query.direction === 'departure';
      const direction = isDeparture ? 'Departure' : 'Arrival';
      const windows = todayWindows();
      const limit = query.limit ?? 30;

      const allFlights: ADBFlight[] = [];

      for (const { from, to } of windows) {
        const url = `${apiUrl}/flights/airports/icao/${icao}/${from}/${to}?direction=${direction}&limit=${limit}`;

        const res = await fetch(url, {
          next: { revalidate: 300 },
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
          },
        });

        if (!res.ok) {
          console.error(`[AeroDataBox] HTTP ${res.status} for ${from}-${to}`);
          continue;
        }

        const json: ADBResponse = await res.json();
        if (json.message) {
          console.error(`[AeroDataBox] ${json.message}`);
          continue;
        }

        const batch = isDeparture ? (json.departures ?? []) : (json.arrivals ?? []);
        allFlights.push(...batch);
      }

      return allFlights.slice(0, limit).map((f): Flight => {
        const mov = f.movement;
        const movIata = mov?.airport?.iata ?? '—';
        const scheduled = parseLocalDate(mov?.scheduledTime?.local);
        const estimated = parseLocalDate(mov?.revisedTime?.local);

        return {
          flightNumber: f.number ?? '—',
          airline: f.airline?.name ?? f.number?.split(' ')[0] ?? '—',
          origin: isDeparture ? HOME_IATA : movIata,
          destination: isDeparture ? movIata : HOME_IATA,
          scheduledTime: scheduled ?? new Date(),
          estimatedTime: estimated,
          actualTime: null,
          status: mapStatus(f.status),
          gate: mov?.gate ?? null,
          terminal: mov?.terminal ?? null,
          direction: query.direction,
          aircraftIata: f.aircraft?.model ?? null,
        };
      });
    },
  };
}
