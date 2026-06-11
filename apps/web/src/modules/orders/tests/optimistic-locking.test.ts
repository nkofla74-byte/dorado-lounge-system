import { describe, it, expect, vi } from 'vitest';
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

function makePedido(overrides: Partial<Pedido> = {}): PedidoWithItems {
  return {
    id: 'ped-1',
    tenantId: 'tenant-1',
    numeroMesa: 'A1',
    zona: 'amex',
    estado: 'creado',
    version: 1,
    notas: null,
    cocineroId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'item-1',
        pedidoId: 'ped-1',
        recetaId: 'rec-1',
        recetaNombre: 'Filete',
        cantidad: 1,
        notas: null,
        areaProduccion: 'cocina_fria' as const,
        estado: 'pendiente' as const,
        enPreparacionAt: null,
        listoAt: null,
        iniciadoPor: null,
        listoPor: null,
      },
    ],
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

function createInMemoryRepo(): OrderRepository & { pedidos: PedidoWithItems[] } {
  const pedidos: PedidoWithItems[] = [];

  return {
    pedidos,
    async findRecetaAreas(_tenantId: string, recetaIds: string[]) {
      const out: Record<string, AreaProduccion | null> = {};
      for (const id of recetaIds) out[id] = 'cocina_fria';
      return out;
    },
    async findActive(tenantId: string) {
      return pedidos.filter(
        (p) =>
          p.tenantId === tenantId &&
          ['creado', 'recibido_cocina', 'en_preparacion', 'despachado'].includes(p.estado),
      );
    },
    async findActiveByZona(tenantId: string, zona: string) {
      return (await this.findActive(tenantId)).filter((p) => p.zona === zona);
    },
    async findActiveByArea(tenantId: string, area: string) {
      return pedidos.filter(
        (p) =>
          p.tenantId === tenantId &&
          p.estado !== 'entregado' &&
          p.estado !== 'cancelado' &&
          (p.items ?? []).some((i) => i.areaProduccion === area),
      );
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
      _itemAreas: Record<string, AreaProduccion>,
    ) {
      void userId;
      void _itemAreas;
      const existing = pedidos.find(
        (p) =>
          p.tenantId === tenantId &&
          (p as unknown as Record<string, unknown>)['idempotencyKey'] === input.idempotencyKey,
      );
      if (existing) throw new Error('DUPLICATE_PEDIDO');

      const p = makePedido({
        id: `ped-${Date.now()}`,
        tenantId,
        zona: input.zona,
        numeroMesa: input.numeroMesa ?? null,
        notas: input.notas ?? null,
      });
      (p as unknown as Record<string, unknown>)['idempotencyKey'] = input.idempotencyKey;
      pedidos.push(p);
      return p;
    },
    async findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null> {
      const p = pedidos.find((p) => p.id === id && p.tenantId === tenantId);
      if (!p) return null;
      return {
        ...p,
        items: p.items.map((i) => ({
          ...i,
          recetaPorciones: 1,
          recetaTipo: 'servicio' as const,
          ingredientes: [],
        })),
      };
    },
    async transition(id: string, tenantId: string, estado: EstadoPedido, version: number) {
      const idx = pedidos.findIndex((p) => p.id === id && p.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');

      if (pedidos[idx]!.version !== version) {
        throw new Error('VERSION_CONFLICT');
      }

      if (!PEDIDO_TRANSITIONS[pedidos[idx]!.estado].includes(estado)) {
        throw new Error('INVALID_TRANSITION');
      }

      pedidos[idx] = { ...pedidos[idx]!, estado, version: version + 1, updatedAt: new Date() };
      return pedidos[idx]!;
    },
    async asignarCocinero(id: string, tenantId: string, cocineroId: string, version: number) {
      const idx = pedidos.findIndex((p) => p.id === id && p.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');
      if (pedidos[idx]!.version !== version) throw new Error('VERSION_CONFLICT');
      pedidos[idx] = { ...pedidos[idx]!, cocineroId, version: version + 1, updatedAt: new Date() };
      return pedidos[idx]!;
    },
    async findItemForTransition() {
      return null;
    },
    async transitionItem() {
      return { pedidoEstado: 'recibido_cocina' as const, pedidoVersion: 1 };
    },
  };
}

describe('Optimistic locking — pedidos', () => {
  it('dos actores leen la misma versión, solo uno logra transicionar', async () => {
    const repo = createInMemoryRepo();
    const pedido = makePedido({ version: 1 });
    repo.pedidos.push(pedido);

    const actor1Version = pedido.version;
    const actor2Version = pedido.version;

    await repo.transition(pedido.id, pedido.tenantId, 'recibido_cocina', actor1Version);

    await expect(
      repo.transition(pedido.id, pedido.tenantId, 'recibido_cocina', actor2Version),
    ).rejects.toThrow('VERSION_CONFLICT');
  });

  it('transición exitosa incrementa la versión', async () => {
    const repo = createInMemoryRepo();
    const pedido = makePedido({ version: 1 });
    repo.pedidos.push(pedido);

    const updated = await repo.transition(pedido.id, pedido.tenantId, 'recibido_cocina', 1);
    expect(updated.version).toBe(2);

    const updated2 = await repo.transition(pedido.id, pedido.tenantId, 'en_preparacion', 2);
    expect(updated2.version).toBe(3);
  });

  it('no se puede transicionar con versión desactualizada después de múltiples cambios', async () => {
    const repo = createInMemoryRepo();
    const pedido = makePedido({ version: 1 });
    repo.pedidos.push(pedido);

    const staleVersion = pedido.version;
    await repo.transition(pedido.id, pedido.tenantId, 'recibido_cocina', 1);
    await repo.transition(pedido.id, pedido.tenantId, 'en_preparacion', 2);

    await expect(
      repo.transition(pedido.id, pedido.tenantId, 'en_preparacion', staleVersion),
    ).rejects.toThrow('VERSION_CONFLICT');
  });

  it('transición inválida es rechazada independiente de la versión', async () => {
    const repo = createInMemoryRepo();
    const pedido = makePedido({ estado: 'creado', version: 1 });
    repo.pedidos.push(pedido);

    await expect(repo.transition(pedido.id, pedido.tenantId, 'entregado', 1)).rejects.toThrow(
      'INVALID_TRANSITION',
    );
  });

  it('ciclo completo con versiones correctas: creado → recibido → prep → despachado → entregado', async () => {
    const repo = createInMemoryRepo();
    const pedido = makePedido({ version: 1 });
    repo.pedidos.push(pedido);

    const v2 = await repo.transition(pedido.id, pedido.tenantId, 'recibido_cocina', 1);
    const v3 = await repo.transition(pedido.id, pedido.tenantId, 'en_preparacion', v2.version);
    const v4 = await repo.transition(pedido.id, pedido.tenantId, 'despachado', v3.version);
    const v5 = await repo.transition(pedido.id, pedido.tenantId, 'entregado', v4.version);

    expect(v5.estado).toBe('entregado');
    expect(v5.version).toBe(5);
  });
});
