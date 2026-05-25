import { describe, it, expect } from 'vitest';
import {
  classifyRoute,
  calculateForecast,
  FORECAST_DEFAULTS,
  type FlightForecastInput,
  type RouteType,
} from '../domain/forecast';

describe('classifyRoute', () => {
  it('vuelo doméstico colombiano', () => {
    expect(classifyRoute('MDE', 'Avianca')).toBe('domestic');
    expect(classifyRoute('CLO', 'LATAM Airlines')).toBe('domestic');
    expect(classifyRoute('CTG', 'Avianca')).toBe('domestic');
  });

  it('vuelo internacional largo (US, Europa)', () => {
    expect(classifyRoute('MIA', 'Avianca')).toBe('international_long');
    expect(classifyRoute('JFK', 'American Airlines')).toBe('international_long');
    expect(classifyRoute('MAD', 'Iberia')).toBe('international_long');
    expect(classifyRoute('CDG', 'Air France')).toBe('international_long');
  });

  it('vuelo internacional regional (Latam)', () => {
    expect(classifyRoute('LIM', 'LATAM Airlines')).toBe('international_regional');
    expect(classifyRoute('SCL', 'Avianca')).toBe('international_regional');
    expect(classifyRoute('PTY', 'Copa Airlines')).toBe('international_regional');
    expect(classifyRoute('GRU', 'Avianca')).toBe('international_regional');
  });

  it('aerolínea low-cost siempre clasifica como lowcost', () => {
    expect(classifyRoute('MIA', 'Spirit')).toBe('lowcost');
    expect(classifyRoute('MDE', 'Viva Air')).toBe('lowcost');
    expect(classifyRoute('MIA', 'Wingo')).toBe('lowcost');
    expect(classifyRoute('LIM', 'JetSMART')).toBe('lowcost');
    expect(classifyRoute('FLL', 'Frontier Airlines')).toBe('lowcost');
  });

  it('low-cost tiene prioridad sobre destino', () => {
    expect(classifyRoute('MAD', 'Spirit')).toBe('lowcost');
  });
});

describe('calculateForecast', () => {
  const makeFlights = (
    specs: Array<{ dest: string; airline: string; cap: number | null; status?: string }>,
  ): FlightForecastInput[] =>
    specs.map((s) => ({
      destination: s.dest,
      airline: s.airline,
      capacity: s.cap,
      status: s.status ?? 'scheduled',
    }));

  it('calcula pronóstico para mix de vuelos típico', () => {
    const flights = makeFlights([
      { dest: 'MIA', airline: 'Avianca', cap: 296 },
      { dest: 'MDE', airline: 'Avianca', cap: 180 },
      { dest: 'LIM', airline: 'LATAM Airlines', cap: 180 },
      { dest: 'FLL', airline: 'Spirit', cap: 189 },
    ]);

    const result = calculateForecast(flights);

    expect(result.totalFlights).toBe(4);
    expect(result.cancelledFlights).toBe(0);
    expect(result.estimatedLoungeVisitors).toBeGreaterThan(0);
    expect(result.byRouteType.international_long.flights).toBe(1);
    expect(result.byRouteType.domestic.flights).toBe(1);
    expect(result.byRouteType.international_regional.flights).toBe(1);
    expect(result.byRouteType.lowcost.flights).toBe(1);
  });

  it('vuelos cancelados no suman al pronóstico', () => {
    const flights = makeFlights([
      { dest: 'MIA', airline: 'Avianca', cap: 296 },
      { dest: 'MDE', airline: 'Avianca', cap: 180, status: 'cancelled' },
    ]);

    const result = calculateForecast(flights);
    expect(result.cancelledFlights).toBe(1);
    expect(result.byRouteType.domestic.flights).toBe(0);
  });

  it('vuelos sin capacidad usan default de 180', () => {
    const flights = makeFlights([{ dest: 'MIA', airline: 'Avianca', cap: null }]);

    const result = calculateForecast(flights);
    expect(result.totalCapacity).toBe(180);
  });

  it('rango min/max es ±30% del estimado', () => {
    const flights = makeFlights([
      { dest: 'MIA', airline: 'Avianca', cap: 296 },
      { dest: 'MAD', airline: 'Iberia', cap: 325 },
    ]);

    const result = calculateForecast(flights);
    expect(result.rangoMin).toBe(Math.round(result.estimatedLoungeVisitors * 0.7));
    expect(result.rangoMax).toBe(Math.round(result.estimatedLoungeVisitors * 1.3));
  });

  it('sin vuelos devuelve ceros', () => {
    const result = calculateForecast([]);
    expect(result.totalFlights).toBe(0);
    expect(result.estimatedLoungeVisitors).toBe(0);
    expect(result.rangoMin).toBe(0);
    expect(result.rangoMax).toBe(0);
  });

  it('internacional largo tiene mayor tasa de acceso que doméstico', () => {
    const intl = calculateForecast(makeFlights([{ dest: 'MIA', airline: 'Avianca', cap: 200 }]));
    const dom = calculateForecast(makeFlights([{ dest: 'MDE', airline: 'Avianca', cap: 200 }]));

    expect(intl.estimatedLoungeVisitors).toBeGreaterThan(dom.estimatedLoungeVisitors);
  });

  it('acepta config personalizada', () => {
    const custom = {
      ...FORECAST_DEFAULTS,
      domestic: { loadFactor: 0.9, loungeAccessRate: 0.1 },
    };

    const result = calculateForecast(
      makeFlights([{ dest: 'MDE', airline: 'Avianca', cap: 100 }]),
      custom,
    );

    expect(result.estimatedLoungeVisitors).toBe(Math.round(100 * 0.9 * 0.1));
  });
});
