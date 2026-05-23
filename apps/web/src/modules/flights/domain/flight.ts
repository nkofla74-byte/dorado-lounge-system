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
  aircraftIata: string | null; // código IATA del modelo de aeronave (ej "320", "788")
}

// Snapshot persistido en BD para histórico y estadísticas.
export interface FlightSnapshot extends Flight {
  fecha: string; // YYYY-MM-DD en TZ America/Bogota
  capacidadEstimada: number | null;
  capturedAt: Date;
  updatedAt: Date;
}

// Fila de la vista materializada mv_ocupacion_diaria.
export interface OcupacionDiaria {
  fecha: string; // YYYY-MM-DD
  direccion: FlightDirection;
  totalVuelos: number;
  vuelosCancelados: number;
  vuelosSinCapacidad: number;
  capacidadEstimada: number;
  pasajerosReales: number;
  ocupacionPct: number | null;
}

// Agregado para el dashboard de estadísticas.
export interface FlightStats {
  hoy: OcupacionDiaria[]; // salidas + llegadas del día más reciente con datos
  ultimos7d: OcupacionDiaria[]; // serie temporal de los últimos 7 días
  topAerolineas: Array<{ aerolinea: string; vuelos: number; capacidad: number }>;
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
