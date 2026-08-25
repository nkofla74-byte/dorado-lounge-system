import { describe, it, expect } from 'vitest';
import {
  createInMemoryRepo,
  makePedido,
  EMPTY_TIMESTAMPS,
} from './support/in-memory-order-repository';
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
