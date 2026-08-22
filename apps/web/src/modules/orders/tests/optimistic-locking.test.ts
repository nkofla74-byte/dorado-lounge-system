import { describe, it, expect, vi } from 'vitest';
import {
  createInMemoryRepo,
  makePedido,
  EMPTY_TIMESTAMPS,
} from './support/in-memory-order-repository';
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
