import { describe, it, expect } from 'vitest';
import { createPedido } from '../application/create-pedido';
import { getPedidos } from '../application/get-pedidos';
import { PEDIDO_TRANSITIONS } from '../domain/pedido';
import type {
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  AreaProduccion,
} from '../domain/pedido';
import type { OrderRepository } from '../application/ports/order-repository.port';

function createInMemoryRepo(): OrderRepository & { pedidos: PedidoWithItems[] } {
  const pedidos: PedidoWithItems[] = [];
  let counter = 0;

  return {
    pedidos,
    async findRecetaAreas(_tenantId: string, recetaIds: string[]) {
      const out: Record<string, AreaProduccion | null> = {};
      for (const id of recetaIds) out[id] = 'cocina_fria';
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
      counter++;
      const p: PedidoWithItems = {
        id: `ped-${counter}`,
        tenantId,
        numeroMesa: input.numeroMesa ?? null,
        zona: input.zona,
        estado: 'creado',
        version: 1,
        notas: input.notas ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: input.items.map((item, idx) => ({
          id: `item-${counter}-${idx}`,
          pedidoId: `ped-${counter}`,
          recetaId: item.recetaId,
          recetaNombre: 'Test',
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
    async findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null> {
      const p = pedidos.find((p) => p.id === id && p.tenantId === tenantId);
      if (!p) return null;
      return { ...p, items: p.items.map((i) => ({ ...i, recetaPorciones: 1, ingredientes: [] })) };
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

const makeInput = (key: string): CreatePedidoInput => ({
  zona: 'amex',
  idempotencyKey: key,
  items: [{ recetaId: 'rec-1', cantidad: 1 }],
});

describe('Aislamiento multi-tenant — pedidos', () => {
  it('tenant A no ve pedidos de tenant B', async () => {
    const repo = createInMemoryRepo();

    await createPedido(repo, 'tenant-A', 'user-A', makeInput('key-1'));
    await createPedido(repo, 'tenant-A', 'user-A', makeInput('key-2'));
    await createPedido(repo, 'tenant-B', 'user-B', makeInput('key-3'));

    const pedidosA = await getPedidos(repo, 'tenant-A');
    const pedidosB = await getPedidos(repo, 'tenant-B');

    expect(pedidosA).toHaveLength(2);
    expect(pedidosB).toHaveLength(1);
    expect(pedidosA.every((p) => p.tenantId === 'tenant-A')).toBe(true);
    expect(pedidosB.every((p) => p.tenantId === 'tenant-B')).toBe(true);
  });

  it('tenant A no puede transicionar pedido de tenant B', async () => {
    const repo = createInMemoryRepo();

    const pedidoB = await createPedido(repo, 'tenant-B', 'user-B', makeInput('key-1'));

    await expect(
      repo.transition(pedidoB.id, 'tenant-A', 'recibido_cocina', pedidoB.version),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('tenant A no puede ver detalle de pedido de tenant B', async () => {
    const repo = createInMemoryRepo();

    const pedidoB = await createPedido(repo, 'tenant-B', 'user-B', makeInput('key-1'));

    const result = await repo.findByIdForDelivery(pedidoB.id, 'tenant-A');
    expect(result).toBeNull();
  });

  it('findActiveByZona filtra por tenant correctamente', async () => {
    const repo = createInMemoryRepo();

    await createPedido(repo, 'tenant-A', 'user-A', makeInput('key-1'));
    await createPedido(repo, 'tenant-B', 'user-B', makeInput('key-2'));

    const zonaPedidosA = await repo.findActiveByZona('tenant-A', 'amex');
    const zonaPedidosB = await repo.findActiveByZona('tenant-B', 'amex');

    expect(zonaPedidosA).toHaveLength(1);
    expect(zonaPedidosB).toHaveLength(1);
  });

  it('historial también está aislado por tenant', async () => {
    const repo = createInMemoryRepo();

    const pA = await createPedido(repo, 'tenant-A', 'user-A', makeInput('key-1'));
    const pB = await createPedido(repo, 'tenant-B', 'user-B', makeInput('key-2'));

    await repo.transition(pA.id, 'tenant-A', 'recibido_cocina', pA.version);
    await repo.transition(pA.id, 'tenant-A', 'en_preparacion', 2);
    await repo.transition(pA.id, 'tenant-A', 'despachado', 3);
    await repo.transition(pA.id, 'tenant-A', 'entregado', 4);

    await repo.transition(pB.id, 'tenant-B', 'recibido_cocina', pB.version);
    await repo.transition(pB.id, 'tenant-B', 'en_preparacion', 2);
    await repo.transition(pB.id, 'tenant-B', 'despachado', 3);
    await repo.transition(pB.id, 'tenant-B', 'entregado', 4);

    const histA = await repo.findRecent('tenant-A', 10);
    const histB = await repo.findRecent('tenant-B', 10);

    expect(histA).toHaveLength(1);
    expect(histB).toHaveLength(1);
    expect(histA[0]!.tenantId).toBe('tenant-A');
    expect(histB[0]!.tenantId).toBe('tenant-B');
  });
});
