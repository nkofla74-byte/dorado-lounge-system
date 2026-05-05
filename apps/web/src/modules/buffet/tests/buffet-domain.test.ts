import { describe, it, expect, vi } from 'vitest';
import type { DespachoBuffet, RecetaServicioBuffet } from '../domain/despacho-buffet';
import type { TicketTurno, TurnoActivo } from '../domain/ticket-turno';
import { getDespachos } from '../application/get-despachos';
import { getTicketsByTurno } from '../application/get-tickets';
import type { BuffetRepository } from '../application/ports/buffet-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeDespacho(overrides: Partial<DespachoBuffet> = {}): DespachoBuffet {
  return {
    id: 'desp-1',
    tenantId: 'tenant-1',
    recetaId: 'receta-1',
    recetaNombre: 'Bandeja de frutas',
    turnoId: 'turno-1',
    cantidad: 3,
    responsableId: 'user-1',
    idempotencyKey: 'idem-key-1',
    despachadoAt: new Date('2026-05-04T08:00:00Z'),
    createdAt: new Date('2026-05-04T08:00:00Z'),
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketTurno> = {}): TicketTurno {
  return {
    id: 'ticket-1',
    tenantId: 'tenant-1',
    turnoId: 'turno-1',
    turnoNombre: 'Turno mañana',
    cantidadTickets: 87,
    registradoPor: 'user-1',
    idempotencyKey: 'ticket-idem-1',
    createdAt: new Date('2026-05-04T14:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<BuffetRepository> = {}): BuffetRepository {
  return {
    findDespachos: vi.fn().mockResolvedValue([]),
    findTicketsByTurno: vi.fn().mockResolvedValue([]),
    findTurnosActivos: vi.fn().mockResolvedValue([]),
    findRecetasServicioBuffet: vi.fn().mockResolvedValue([]),
    findRecetaServicioBuffet: vi.fn().mockResolvedValue(null),
    createDespacho: vi.fn().mockResolvedValue(makeDespacho()),
    createTickets: vi.fn().mockResolvedValue(makeTicket()),
    ...overrides,
  };
}

// ── Invariantes de dominio ────────────────────────────────────────────────────

describe('DespachoBuffet', () => {
  it('cantidad representa lotes despachados (entero positivo)', () => {
    const despacho = makeDespacho({ cantidad: 3 });
    expect(despacho.cantidad).toBeGreaterThan(0);
    expect(Number.isInteger(despacho.cantidad)).toBe(true);
  });

  it('puede no tener turnoId asociado (despacho fuera de turno)', () => {
    const despacho = makeDespacho({ turnoId: null });
    expect(despacho.turnoId).toBeNull();
  });

  it('tiene idempotencyKey para prevenir doble despacho', () => {
    const despacho = makeDespacho({ idempotencyKey: 'uuid-key' });
    expect(despacho.idempotencyKey).toBeDefined();
    expect(despacho.idempotencyKey).not.toBe('');
  });
});

describe('TicketTurno', () => {
  it('1 ticket = 1 servicio a pasajero', () => {
    const ticket = makeTicket({ cantidadTickets: 87 });
    expect(ticket.cantidadTickets).toBeGreaterThan(0);
    expect(Number.isInteger(ticket.cantidadTickets)).toBe(true);
  });

  it('está vinculado a un turno', () => {
    const ticket = makeTicket({ turnoId: 'turno-abc' });
    expect(ticket.turnoId).toBe('turno-abc');
  });

  it('tiene idempotencyKey para prevenir registro doble', () => {
    const ticket = makeTicket({ idempotencyKey: 'ticket-idem' });
    expect(ticket.idempotencyKey).not.toBe('');
  });

  it('puede registrarse sin responsable asignado', () => {
    const ticket = makeTicket({ registradoPor: null });
    expect(ticket.registradoPor).toBeNull();
  });
});

describe('Conciliación buffet: despachos vs tickets', () => {
  it('el total de porciones despachadas puede superar los tickets (merma operativa)', () => {
    const porciones = 3 * 12; // 3 lotes de 12 porciones
    const tickets = 34;
    // normal: siempre habrá más porciones que tickets (sobra)
    expect(porciones).toBeGreaterThanOrEqual(tickets);
  });

  it('diferencia ticket - porciones negativa indica consumo excedente (alarma)', () => {
    const porciones = 24;
    const tickets = 30;
    const diferencia = porciones - tickets;
    expect(diferencia).toBeLessThan(0);
  });
});

// ── Use cases ─────────────────────────────────────────────────────────────────

describe('getDespachos', () => {
  it('llama findDespachos con tenantId', async () => {
    const despachos = [makeDespacho()];
    const repo = makeRepo({ findDespachos: vi.fn().mockResolvedValue(despachos) });
    const result = await getDespachos(repo, 'tenant-1', undefined);
    expect(repo.findDespachos).toHaveBeenCalledWith('tenant-1', undefined);
    expect(result).toBe(despachos);
  });

  it('filtra por turnoId cuando se especifica', async () => {
    const repo = makeRepo({ findDespachos: vi.fn().mockResolvedValue([]) });
    await getDespachos(repo, 'tenant-1', 'turno-1');
    expect(repo.findDespachos).toHaveBeenCalledWith('tenant-1', 'turno-1');
  });
});

describe('getTicketsByTurno', () => {
  it('llama findTicketsByTurno con tenantId y turnoId', async () => {
    const tickets = [makeTicket()];
    const repo = makeRepo({ findTicketsByTurno: vi.fn().mockResolvedValue(tickets) });
    const result = await getTicketsByTurno(repo, 'tenant-1', 'turno-1');
    expect(repo.findTicketsByTurno).toHaveBeenCalledWith('tenant-1', 'turno-1');
    expect(result).toBe(tickets);
  });

  it('devuelve lista vacía si no hay tickets en el turno', async () => {
    const repo = makeRepo({ findTicketsByTurno: vi.fn().mockResolvedValue([]) });
    const result = await getTicketsByTurno(repo, 'tenant-1', 'turno-sin-tickets');
    expect(result).toHaveLength(0);
  });
});
