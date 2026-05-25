export type RouteType = 'international_long' | 'international_regional' | 'domestic' | 'lowcost';

export interface ForecastConfig {
  loadFactor: number;
  loungeAccessRate: number;
}

export const FORECAST_DEFAULTS: Record<RouteType, ForecastConfig> = {
  international_long: { loadFactor: 0.87, loungeAccessRate: 0.07 },
  international_regional: { loadFactor: 0.85, loungeAccessRate: 0.05 },
  domestic: { loadFactor: 0.83, loungeAccessRate: 0.02 },
  lowcost: { loadFactor: 0.9, loungeAccessRate: 0.007 },
};

const COLOMBIA_AIRPORTS = new Set([
  'BOG',
  'MDE',
  'CLO',
  'CTG',
  'BAQ',
  'BGA',
  'PEI',
  'SMR',
  'ADZ',
  'CUC',
  'EOH',
  'MTR',
  'NVA',
  'VUP',
  'AXM',
  'IBE',
  'PSO',
  'FLA',
  'LET',
  'RCH',
  'UIB',
  'APO',
  'PPN',
  'TCO',
  'MZL',
  'EJA',
]);

const LOWCOST_AIRLINES = new Set([
  'viva',
  'viva air',
  'vivaair',
  'viva aerobus',
  'spirit',
  'spirit airlines',
  'frontier',
  'frontier airlines',
  'jetsmart',
  'wingo',
  'ultra air',
  'flair',
  'flair airlines',
]);

const LONGHAUL_COUNTRIES = new Set([
  'US',
  'CA',
  'MX',
  'ES',
  'FR',
  'DE',
  'GB',
  'NL',
  'IT',
  'PT',
  'TR',
]);

const LONGHAUL_AIRPORTS = new Set([
  'MIA',
  'FLL',
  'JFK',
  'EWR',
  'IAH',
  'DFW',
  'ATL',
  'LAX',
  'ORD',
  'MCO',
  'YYZ',
  'YUL',
  'MEX',
  'CUN',
  'GDL',
  'MAD',
  'BCN',
  'CDG',
  'AMS',
  'FRA',
  'LHR',
  'FCO',
  'LIS',
  'IST',
]);

export function classifyRoute(destination: string, airline: string): RouteType {
  const airlineLower = airline.toLowerCase().trim();
  if (LOWCOST_AIRLINES.has(airlineLower)) return 'lowcost';
  if (COLOMBIA_AIRPORTS.has(destination)) return 'domestic';
  if (LONGHAUL_AIRPORTS.has(destination)) return 'international_long';
  return 'international_regional';
}

export interface FlightForecastInput {
  destination: string;
  airline: string;
  capacity: number | null;
  status: string;
}

export interface ForecastResult {
  totalFlights: number;
  cancelledFlights: number;
  totalCapacity: number;
  estimatedPassengers: number;
  estimatedLoungeVisitors: number;
  byRouteType: Record<
    RouteType,
    {
      flights: number;
      capacity: number;
      passengers: number;
      loungeVisitors: number;
    }
  >;
  rangoMin: number;
  rangoMax: number;
}

export function calculateForecast(
  flights: FlightForecastInput[],
  config: Record<RouteType, ForecastConfig> = FORECAST_DEFAULTS,
): ForecastResult {
  const byRouteType: ForecastResult['byRouteType'] = {
    international_long: { flights: 0, capacity: 0, passengers: 0, loungeVisitors: 0 },
    international_regional: { flights: 0, capacity: 0, passengers: 0, loungeVisitors: 0 },
    domestic: { flights: 0, capacity: 0, passengers: 0, loungeVisitors: 0 },
    lowcost: { flights: 0, capacity: 0, passengers: 0, loungeVisitors: 0 },
  };

  let totalCapacity = 0;
  let estimatedPassengers = 0;
  let estimatedLoungeVisitors = 0;
  let cancelledFlights = 0;

  const DEFAULT_CAPACITY = 180;

  for (const flight of flights) {
    if (flight.status === 'cancelled') {
      cancelledFlights++;
      continue;
    }

    const routeType = classifyRoute(flight.destination, flight.airline);
    const cfg = config[routeType];
    const capacity = flight.capacity ?? DEFAULT_CAPACITY;

    const passengers = Math.round(capacity * cfg.loadFactor);
    const visitors = capacity * cfg.loadFactor * cfg.loungeAccessRate;

    const bucket = byRouteType[routeType];
    bucket.flights++;
    bucket.capacity += capacity;
    bucket.passengers += passengers;
    bucket.loungeVisitors += visitors;

    totalCapacity += capacity;
    estimatedPassengers += passengers;
    estimatedLoungeVisitors += visitors;
  }

  const rounded = Math.round(estimatedLoungeVisitors);

  return {
    totalFlights: flights.length,
    cancelledFlights,
    totalCapacity,
    estimatedPassengers,
    estimatedLoungeVisitors: rounded,
    byRouteType,
    rangoMin: Math.round(rounded * 0.7),
    rangoMax: Math.round(rounded * 1.3),
  };
}
