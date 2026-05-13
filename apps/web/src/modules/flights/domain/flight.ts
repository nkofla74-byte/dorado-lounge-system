export type FlightStatus = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'unknown';

export type FlightDirection = 'departure' | 'arrival';

export interface Flight {
  flightNumber: string;
  airline: string;
  origin: string; // IATA — para llegadas es el aeropuerto de origen
  destination: string; // IATA — para salidas es el destino
  scheduledTime: Date;
  estimatedTime: Date | null;
  actualTime: Date | null;
  status: FlightStatus;
  gate: string | null;
  terminal: string | null;
  direction: FlightDirection;
}

export interface FlightsQuery {
  direction: FlightDirection;
  airportIata: string; // 'BOG' para El Dorado
  limit?: number;
}

export function effectiveTime(flight: Flight): Date {
  return flight.actualTime ?? flight.estimatedTime ?? flight.scheduledTime;
}

export function isDelayed(flight: Flight): boolean {
  if (!flight.estimatedTime) return false;
  const diffMs = flight.estimatedTime.getTime() - flight.scheduledTime.getTime();
  return diffMs > 10 * 60 * 1000; // más de 10 minutos
}
