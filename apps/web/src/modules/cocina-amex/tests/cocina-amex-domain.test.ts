import { describe, it, expect, vi } from 'vitest';
import {
  AMEX_URGENCY_WARN_MINS,
  AMEX_URGENCY_CRIT_MINS,
  PEDIDO_TRANSITIONS,
} from '../domain/pedido-amex';
import type { PedidoWithItems, PedidoEvento } from '../domain/pedido-amex';
import type { CocinaAmexRepository } from '../application/ports';
import { getPedidosAmex } from '../application/get-pedidos-amex';
import { getEventosPedido } from '../application/get-eventos-pedido';

// ── Factories ─────────────────────────────────────────────────────────────────

function makePedido(overrides: Partial<PedidoWithItems> = {}): PedidoWithItems {
  return {
    id: 'pedido-1',
    tenantId: 'tenant-1',
    zona: 'amex',
    numeroMesa: 'A-1',
    estado: 'creado',
    notas: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    version: 0,
    items: [],
    timestamps: {
      recibidoCocinaAt: null,
      enPreparacionAt: null,
      despachadoAt: null,
      entregadoAt: null,
      canceladoAt: null,
    },
    ...overrides,
  };
}

function makeEvento(overrides: Partial<PedidoEvento> = {}): PedidoEvento {
  return {
    id: 'evento-1',
    pedidoId: 'pedido-1',
    estado: 'creado',
    actorId: null,
    actorNombre: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<CocinaAmexRepository> = {}): CocinaAmexRepository {
  return {
    findActivosAmex: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    transition: vi.fn().mockResolvedValue(makePedido()),
    registrarEvento: vi.fn().mockResolvedValue(undefined),
    findEventosByPedido: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Umbrales de urgencia AMEX ─────────────────────────────────────────────────

describe('AMEX_URGENCY thresholds', () => {
  it('warn y crit son positivos', () => {
    expect(AMEX_URGENCY_WARN_MINS).toBeGreaterThan(0);
    expect(AMEX_URGENCY_CRIT_MINS).toBeGreaterThan(0);
  });

  it('crit > warn (la alerta crítica debe activarse después de la advertencia)', () => {
    expect(AMEX_URGENCY_CRIT_MINS).toBeGreaterThan(AMEX_URGENCY_WARN_MINS);
  });
});

// ── Re-export de PEDIDO_TRANSITIONS ───────────────────────────────────────────

describe('PEDIDO_TRANSITIONS re-export', () => {
  it('re-exporta la máquina de estados de orders', () => {
    expect(PEDIDO_TRANSITIONS).toBeDefined();
    expect(PEDIDO_TRANSITIONS['creado']).toContain('recibido_cocina');
    expect(PEDIDO_TRANSITIONS['recibido_cocina']).toContain('en_preparacion');
    expect(PEDIDO_TRANSITIONS['en_preparacion']).toContain('despachado');
  });
});

// ── getPedidosAmex (use case) ─────────────────────────────────────────────────

describe('getPedidosAmex', () => {
  it('delega al repo.findActivosAmex con el tenantId', async () => {
    const repo = makeRepo();
    await getPedidosAmex(repo, 'tenant-1');
    expect(repo.findActivosAmex).toHaveBeenCalledWith('tenant-1');
  });

  it('devuelve la lista de pedidos activos retornada por el repositorio', async () => {
    const pedidos = [makePedido(), makePedido({ id: 'pedido-2', numeroMesa: 'A-2' })];
    const repo = makeRepo({ findActivosAmex: vi.fn().mockResolvedValue(pedidos) });
    const result = await getPedidosAmex(repo, 'tenant-1');
    expect(result).toBe(pedidos);
    expect(result).toHaveLength(2);
  });

  it('devuelve lista vacía si no hay pedidos activos', async () => {
    const repo = makeRepo({ findActivosAmex: vi.fn().mockResolvedValue([]) });
    expect(await getPedidosAmex(repo, 'tenant-1')).toHaveLength(0);
  });
});

// ── getEventosPedido (use case) ───────────────────────────────────────────────

describe('getEventosPedido', () => {
  it('delega al repo.findEventosByPedido con tenantId y pedidoId', async () => {
    const repo = makeRepo();
    await getEventosPedido(repo, 'tenant-1', 'pedido-1');
    expect(repo.findEventosByPedido).toHaveBeenCalledWith('tenant-1', 'pedido-1');
  });

  it('devuelve la lista de eventos retornada por el repositorio', async () => {
    const eventos = [
      makeEvento({ estado: 'creado' }),
      makeEvento({ id: 'evento-2', estado: 'recibido_cocina' }),
      makeEvento({ id: 'evento-3', estado: 'en_preparacion' }),
    ];
    const repo = makeRepo({ findEventosByPedido: vi.fn().mockResolvedValue(eventos) });
    const result = await getEventosPedido(repo, 'tenant-1', 'pedido-1');
    expect(result).toBe(eventos);
    expect(result.map((e) => e.estado)).toEqual(['creado', 'recibido_cocina', 'en_preparacion']);
  });

  it('devuelve lista vacía si no hay eventos para el pedido', async () => {
    const repo = makeRepo({ findEventosByPedido: vi.fn().mockResolvedValue([]) });
    expect(await getEventosPedido(repo, 'tenant-1', 'sin-eventos')).toHaveLength(0);
  });
});
