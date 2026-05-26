import { describe, it, expect } from 'vitest';
import { getDespachos } from '../application/get-despachos';
import { getTicketsByTurno } from '../application/get-tickets';
import type { BuffetRepository } from '../application/ports/buffet-repository.port';
import type { DespachoBuffet, CreateDespachoBuffetInput } from '../domain/despacho-buffet';
import type { TicketTurno, TurnoActivo, CreateTicketsTurnoInput } from '../domain/ticket-turno';

function makeDespacho(overrides: Partial<DespachoBuffet> = {}): DespachoBuffet {
  return {
    id: 'desp-1',
    tenantId: 'tenant-1',
    recetaId: 'rec-1',
    recetaNombre: 'Ensalada César',
    turnoId: 'turno-1',
    cantidad: 3,
    responsableId: 'user-1',
    idempotencyKey: 'key-1',
    despachadoAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeTicket(overrides: Partial<TicketTurno> = {}): TicketTurno {
  return {
    id: 'ticket-1',
    tenantId: 'tenant-1',
    turnoId: 'turno-1',
    turnoNombre: 'Turno 6a2',
    cantidadTickets: 45,
    registradoPor: 'user-1',
    idempotencyKey: 'idem-1',
    createdAt: new Date(),
    ...overrides,
  };
}

function createInMemoryRepo(): BuffetRepository & {
  despachos: DespachoBuffet[];
  tickets: TicketTurno[];
} {
  const despachos: DespachoBuffet[] = [];
  const tickets: TicketTurno[] = [];
  let counter = 0;

  return {
    despachos,
    tickets,
    async findDespachos(tenantId: string, turnoId?: string) {
      return despachos.filter(
        (d) => d.tenantId === tenantId && (!turnoId || d.turnoId === turnoId),
      );
    },
    async findRecetaServicioBuffet() {
      return null;
    },
    async createDespacho(
      tenantId: string,
      input: CreateDespachoBuffetInput & { responsableId: string },
    ) {
      counter++;
      const d = makeDespacho({
        id: `desp-${counter}`,
        tenantId,
        recetaId: input.recetaId,
        cantidad: input.cantidad,
        turnoId: input.turnoId ?? null,
        idempotencyKey: input.idempotencyKey,
        responsableId: input.responsableId,
      });
      despachos.push(d);
      return d;
    },
    async findTicketsByTurno(tenantId: string, turnoId: string) {
      return tickets.filter((t) => t.tenantId === tenantId && t.turnoId === turnoId);
    },
    async createTickets(
      tenantId: string,
      input: CreateTicketsTurnoInput & { registradoPor: string },
    ) {
      counter++;
      const t = makeTicket({
        id: `ticket-${counter}`,
        tenantId,
        turnoId: input.turnoId,
        cantidadTickets: input.cantidadTickets,
        registradoPor: input.registradoPor,
      });
      tickets.push(t);
      return t;
    },
    async findTurnosActivos(tenantId: string): Promise<TurnoActivo[]> {
      return [];
    },
    async findRecetasServicioBuffet() {
      return [];
    },
  };
}

describe('getDespachos buffet (application)', () => {
  it('retorna despachos del tenant', async () => {
    const repo = createInMemoryRepo();
    repo.despachos.push(makeDespacho({ tenantId: 'tenant-1' }));
    repo.despachos.push(makeDespacho({ id: 'desp-2', tenantId: 'tenant-2' }));
    const result = await getDespachos(repo, 'tenant-1');
    expect(result).toHaveLength(1);
  });

  it('filtra por turnoId cuando se especifica', async () => {
    const repo = createInMemoryRepo();
    repo.despachos.push(makeDespacho({ turnoId: 'turno-1' }));
    repo.despachos.push(makeDespacho({ id: 'desp-2', turnoId: 'turno-2' }));
    const result = await getDespachos(repo, 'tenant-1', 'turno-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.turnoId).toBe('turno-1');
  });

  it('retorna todos sin filtro de turno', async () => {
    const repo = createInMemoryRepo();
    repo.despachos.push(makeDespacho({ turnoId: 'turno-1' }));
    repo.despachos.push(makeDespacho({ id: 'desp-2', turnoId: 'turno-2' }));
    const result = await getDespachos(repo, 'tenant-1');
    expect(result).toHaveLength(2);
  });

  it('retorna lista vacía si no hay despachos', async () => {
    const repo = createInMemoryRepo();
    const result = await getDespachos(repo, 'tenant-1');
    expect(result).toHaveLength(0);
  });
});

describe('getTicketsByTurno buffet (application)', () => {
  it('retorna tickets del turno especificado', async () => {
    const repo = createInMemoryRepo();
    repo.tickets.push(makeTicket({ turnoId: 'turno-1', cantidadTickets: 30 }));
    repo.tickets.push(makeTicket({ id: 'ticket-2', turnoId: 'turno-2', cantidadTickets: 50 }));
    const result = await getTicketsByTurno(repo, 'tenant-1', 'turno-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.cantidadTickets).toBe(30);
  });

  it('retorna lista vacía si el turno no tiene tickets', async () => {
    const repo = createInMemoryRepo();
    const result = await getTicketsByTurno(repo, 'tenant-1', 'turno-inexistente');
    expect(result).toHaveLength(0);
  });

  it('aísla por tenant', async () => {
    const repo = createInMemoryRepo();
    repo.tickets.push(makeTicket({ tenantId: 'tenant-2', turnoId: 'turno-1' }));
    const result = await getTicketsByTurno(repo, 'tenant-1', 'turno-1');
    expect(result).toHaveLength(0);
  });
});

describe('despacho + ticket flow (integration)', () => {
  it('despacho crea registro y ticket registra conciliación', async () => {
    const repo = createInMemoryRepo();
    const despacho = await repo.createDespacho('tenant-1', {
      recetaId: 'rec-1',
      cantidad: 5,
      turnoId: 'turno-1',
      idempotencyKey: 'flow-1',
      responsableId: 'user-1',
    });
    expect(repo.despachos).toHaveLength(1);
    expect(despacho.cantidad).toBe(5);

    const ticket = await repo.createTickets('tenant-1', {
      turnoId: 'turno-1',
      cantidadTickets: 42,
      idempotencyKey: 'ticket-1',
      registradoPor: 'user-1',
    });
    expect(repo.tickets).toHaveLength(1);
    expect(ticket.cantidadTickets).toBe(42);
  });
});
