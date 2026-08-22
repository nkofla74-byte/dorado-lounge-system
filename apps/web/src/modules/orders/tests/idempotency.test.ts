import { describe, it, expect } from 'vitest';
import {
  createInMemoryRepo,
  makePedido,
  EMPTY_TIMESTAMPS,
} from './support/in-memory-order-repository';
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
