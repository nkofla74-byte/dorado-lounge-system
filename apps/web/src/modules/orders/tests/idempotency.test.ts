import { describe, it, expect } from 'vitest';
import { createPedido } from '../application/create-pedido';
import { PEDIDO_TRANSITIONS } from '../domain/pedido';
import type {
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  AreaProduccion,
} from '../domain/pedido';
import type { OrderRepository } from '../application/ports/order-repository.port';

function createInMemoryRepo(): OrderRepository & { pedidos: PedidoWithItems[] } {
  const pedidos: PedidoWithItems[] = [];
  const seenKeys = new Set<string>();

  return {
    pedidos,
    async findRecetaAreas(_tenantId: string, recetaIds: string[]) {
      const out: Record<string, AreaProduccion | null> = {};
      for (const id of recetaIds) out[id] = 'cocina_fria'; // permitida para amex/snack/buffet
      return out;
    },
    async findActive(tenantId: string) {
      return pedidos.filter(
        (p) => p.tenantId === tenantId && !['entregado', 'cancelado'].includes(p.estado),
      );
    },
    async findActiveByZona(tenantId: string, zona: string) {
      return (await this.findActive(tenantId)).filter((p) => p.zona === zona);
    },
    async findRecent(tenantId: string, limit: number) {
      return pedidos
        .filter((p) => p.tenantId === tenantId && ['entregado', 'cancelado'].includes(p.estado))
        .slice(0, limit);
    },
    async create(
      tenantId: string,
      userId: string,
      input: CreatePedidoInput,
      itemAreas: Record<string, AreaProduccion>,
    ) {
      void userId;
      const compositeKey = `${tenantId}:${input.idempotencyKey}`;
      if (seenKeys.has(compositeKey)) {
        throw new Error('DUPLICATE_PEDIDO');
      }
      seenKeys.add(compositeKey);

      const p: PedidoWithItems = {
        id: `ped-${pedidos.length + 1}`,
        tenantId,
        numeroMesa: input.numeroMesa ?? null,
        zona: input.zona,
        estado: 'creado',
        version: 1,
        notas: input.notas ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: input.items.map((item, idx) => ({
          id: `item-${idx}`,
          pedidoId: `ped-${pedidos.length + 1}`,
          recetaId: item.recetaId,
          recetaNombre: 'Plato test',
          cantidad: item.cantidad,
          notas: null,
          areaProduccion: itemAreas[item.recetaId] ?? null,
        })),
        timestamps: {
          recibidoCocinaAt: null,
          enPreparacionAt: null,
          despachadoAt: null,
          entregadoAt: null,
          canceladoAt: null,
        },
      };
      pedidos.push(p);
      return p;
    },
    async findByIdForDelivery(): Promise<PedidoForDelivery | null> {
      return null;
    },
    async transition(id: string, tenantId: string, estado: EstadoPedido, version: number) {
      const idx = pedidos.findIndex((p) => p.id === id && p.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');
      if (pedidos[idx]!.version !== version) throw new Error('VERSION_CONFLICT');
      if (!PEDIDO_TRANSITIONS[pedidos[idx]!.estado].includes(estado)) {
        throw new Error('INVALID_TRANSITION');
      }
      pedidos[idx] = { ...pedidos[idx]!, estado, version: version + 1 };
      return pedidos[idx]!;
    },
  };
}

describe('Idempotencia — createPedido', () => {
  const baseInput: CreatePedidoInput = {
    zona: 'amex',
    idempotencyKey: 'key-abc-123',
    numeroMesa: 'A1',
    items: [{ recetaId: 'rec-1', cantidad: 2 }],
  };

  it('primer envío crea el pedido correctamente', async () => {
    const repo = createInMemoryRepo();
    const result = await createPedido(repo, 'tenant-1', 'user-1', baseInput);
    expect(result.estado).toBe('creado');
    expect(result.items).toHaveLength(1);
    expect(repo.pedidos).toHaveLength(1);
  });

  it('segundo envío con la misma key es rechazado', async () => {
    const repo = createInMemoryRepo();
    await createPedido(repo, 'tenant-1', 'user-1', baseInput);

    await expect(createPedido(repo, 'tenant-1', 'user-1', baseInput)).rejects.toThrow(
      'DUPLICATE_PEDIDO',
    );
    expect(repo.pedidos).toHaveLength(1);
  });

  it('misma key pero diferente tenant es permitida', async () => {
    const repo = createInMemoryRepo();
    await createPedido(repo, 'tenant-1', 'user-1', baseInput);
    const second = await createPedido(repo, 'tenant-2', 'user-2', baseInput);
    expect(second.tenantId).toBe('tenant-2');
    expect(repo.pedidos).toHaveLength(2);
  });

  it('diferente key en el mismo tenant crea pedido nuevo', async () => {
    const repo = createInMemoryRepo();
    await createPedido(repo, 'tenant-1', 'user-1', baseInput);
    const second = await createPedido(repo, 'tenant-1', 'user-1', {
      ...baseInput,
      idempotencyKey: 'key-different',
    });
    expect(second.id).not.toBe(repo.pedidos[0]!.id);
    expect(repo.pedidos).toHaveLength(2);
  });

  it('envío triple con la misma key solo crea un pedido', async () => {
    const repo = createInMemoryRepo();
    await createPedido(repo, 'tenant-1', 'user-1', baseInput);

    const results = await Promise.allSettled([
      createPedido(repo, 'tenant-1', 'user-1', baseInput),
      createPedido(repo, 'tenant-1', 'user-1', baseInput),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(repo.pedidos).toHaveLength(1);
  });
});
