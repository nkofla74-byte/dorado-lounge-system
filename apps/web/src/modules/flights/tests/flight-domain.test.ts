import { describe, expect, it, vi } from 'vitest';
import { effectiveTime, isDelayed, type Flight } from '../domain/flight';
import { getFlights } from '../application/get-flights';

function makeFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    flightNumber: 'AV9320',
    airline: 'Avianca',
    origin: 'BOG',
    destination: 'MDE',
    scheduledTime: new Date('2026-05-17T14:00:00Z'),
    estimatedTime: null,
    actualTime: null,
    status: 'scheduled',
    gate: null,
    terminal: null,
    direction: 'departure',
    aircraftIata: null,
    ...overrides,
  };
}

describe('flight domain — effectiveTime', () => {
  it('devuelve actualTime cuando está presente', () => {
    const flight = makeFlight({
      scheduledTime: new Date('2026-05-17T14:00:00Z'),
      estimatedTime: new Date('2026-05-17T14:10:00Z'),
      actualTime: new Date('2026-05-17T14:15:00Z'),
    });
    expect(effectiveTime(flight)).toEqual(new Date('2026-05-17T14:15:00Z'));
  });

  it('cae a estimatedTime cuando no hay actualTime', () => {
    const flight = makeFlight({
      scheduledTime: new Date('2026-05-17T14:00:00Z'),
      estimatedTime: new Date('2026-05-17T14:10:00Z'),
    });
    expect(effectiveTime(flight)).toEqual(new Date('2026-05-17T14:10:00Z'));
  });

  it('cae a scheduledTime si no hay estimated ni actual', () => {
    const flight = makeFlight();
    expect(effectiveTime(flight)).toEqual(new Date('2026-05-17T14:00:00Z'));
  });
});

describe('flight domain — isDelayed', () => {
  it('no está demorado si no hay estimatedTime', () => {
    expect(isDelayed(makeFlight())).toBe(false);
  });

  it('no está demorado si el estimate es igual al programado', () => {
    const flight = makeFlight({
      estimatedTime: new Date('2026-05-17T14:00:00Z'),
    });
    expect(isDelayed(flight)).toBe(false);
  });

  it('no está demorado si el estimate es 10 min exactos después (umbral estricto)', () => {
    const flight = makeFlight({
      estimatedTime: new Date('2026-05-17T14:10:00Z'),
    });
    expect(isDelayed(flight)).toBe(false);
  });

  it('está demorado si el estimate es 11 min después', () => {
    const flight = makeFlight({
      estimatedTime: new Date('2026-05-17T14:11:00Z'),
    });
    expect(isDelayed(flight)).toBe(true);
  });

  it('NO marca demora si el estimate es ANTES del programado (vuelo adelantado)', () => {
    const flight = makeFlight({
      estimatedTime: new Date('2026-05-17T13:30:00Z'),
    });
    expect(isDelayed(flight)).toBe(false);
  });
});

describe('flight application — getFlights', () => {
  it('devuelve los vuelos ordenados por hora efectiva ascendente', async () => {
    const flights: Flight[] = [
      makeFlight({
        flightNumber: 'AV3',
        scheduledTime: new Date('2026-05-17T16:00:00Z'),
      }),
      makeFlight({
        flightNumber: 'AV1',
        scheduledTime: new Date('2026-05-17T14:00:00Z'),
      }),
      makeFlight({
        flightNumber: 'AV2',
        scheduledTime: new Date('2026-05-17T15:00:00Z'),
        estimatedTime: new Date('2026-05-17T13:55:00Z'), // adelantado
      }),
    ];
    const provider = { getFlights: vi.fn(async () => flights) };
    const sorted = await getFlights(provider, { direction: 'departure', airportIata: 'BOG' });
    expect(sorted.map((f) => f.flightNumber)).toEqual(['AV2', 'AV1', 'AV3']);
  });

  it('pasa la query íntegra al provider', async () => {
    const provider = { getFlights: vi.fn(async () => []) };
    await getFlights(provider, { direction: 'arrival', airportIata: 'BOG', limit: 50 });
    expect(provider.getFlights).toHaveBeenCalledWith({
      direction: 'arrival',
      airportIata: 'BOG',
      limit: 50,
    });
  });

  it('devuelve array vacío si el provider devuelve vacío', async () => {
    const provider = { getFlights: vi.fn(async () => []) };
    const result = await getFlights(provider, { direction: 'departure', airportIata: 'BOG' });
    expect(result).toEqual([]);
  });
});
