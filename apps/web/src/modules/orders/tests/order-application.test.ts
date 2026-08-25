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
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  AreaProduccion,
} from '../domain/pedido';
import type { OrderRepository } from '../application/ports/order-repository.port';

describe('createPedido (application)', () => {
  it('crea un pedido con items', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      numeroMesa: 'M5',
      idempotencyKey: 'key-1',
      items: [
        { recetaId: 'rec-1', cantidad: 2 },
        { recetaId: 'rec-2', cantidad: 1 },
      ],
    });
    expect(ped.zona).toBe('amex');
    expect(ped.numeroMesa).toBe('M5');
    expect(ped.items).toHaveLength(2);
    expect(ped.estado).toBe('creado');
  });

  it('pedido inicia con version 1', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'snack',
      idempotencyKey: 'key-2',
      items: [{ recetaId: 'rec-1', cantidad: 1 }],
    });
    expect(ped.version).toBe(1);
  });

  it('pedidos distintos tienen IDs únicos', async () => {
    const repo = createInMemoryRepo();
    const input: CreatePedidoInput = {
      zona: 'amex',
      idempotencyKey: 'key-a',
      items: [{ recetaId: 'rec-1', cantidad: 1 }],
    };
    const a = await createPedido(repo, 'tenant-1', 'user-1', { ...input, idempotencyKey: 'k1' });
    const b = await createPedido(repo, 'tenant-1', 'user-1', { ...input, idempotencyKey: 'k2' });
    expect(a.id).not.toBe(b.id);
  });

  it('rutea cada item al área de su receta y la persiste', async () => {
    const repo = createInMemoryRepo({ 'rec-fria': 'cocina_fria', 'rec-amex': 'amex' });
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'route-1',
      items: [
        { recetaId: 'rec-fria', cantidad: 1 },
        { recetaId: 'rec-amex', cantidad: 1 },
      ],
    });
    const areas = ped.items.map((i) => i.areaProduccion).sort();
    expect(areas).toEqual(['amex', 'cocina_fria']);
  });

  it('rechaza un pedido con una receta sin área de producción', async () => {
    const repo = createInMemoryRepo({ 'rec-sin': null });
    await expect(
      createPedido(repo, 'tenant-1', 'user-1', {
        zona: 'snack',
        idempotencyKey: 'sin-1',
        items: [{ recetaId: 'rec-sin', cantidad: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'RECETA_SIN_AREA' });
  });

  it('rechaza rutear a un área no permitida para la zona (AMEX → cocina_caliente)', async () => {
    const repo = createInMemoryRepo({ 'rec-cal': 'cocina_caliente' });
    await expect(
      createPedido(repo, 'tenant-1', 'user-1', {
        zona: 'amex',
        idempotencyKey: 'noperm-1',
        items: [{ recetaId: 'rec-cal', cantidad: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'AREA_NO_PERMITIDA' });
  });
});

describe('asignarCocinero (via repo)', () => {
  it('asigna el cocinero y aumenta la versión', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'cook-1',
      items: [{ recetaId: 'rec-1', cantidad: 1 }],
    });
    const v0 = ped.version;
    const updated = await repo.asignarCocinero(ped.id, 'tenant-1', 'cocinero-9', v0);
    expect(updated.cocineroId).toBe('cocinero-9');
    expect(updated.version).toBe(v0 + 1);
  });

  it('rechaza con VERSION_CONFLICT si la versión está desactualizada', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'cook-2',
      items: [{ recetaId: 'rec-1', cantidad: 1 }],
    });
    const v0 = ped.version;
    await repo.asignarCocinero(ped.id, 'tenant-1', 'cocinero-1', v0);
    await expect(repo.asignarCocinero(ped.id, 'tenant-1', 'cocinero-2', v0)).rejects.toThrow(
      'VERSION_CONFLICT',
    );
  });
});

describe('getPedidos (application)', () => {
  it('retorna solo pedidos activos del tenant', async () => {
    const repo = createInMemoryRepo();
    await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'k1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await createPedido(repo, 'tenant-2', 'user-2', {
      zona: 'amex',
      idempotencyKey: 'k2',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    const result = await getPedidos(repo, 'tenant-1');
    expect(result).toHaveLength(1);
    expect(result[0]?.tenantId).toBe('tenant-1');
  });

  it('excluye pedidos entregados y cancelados', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'k1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await repo.transition(ped.id, 'tenant-1', 'recibido_cocina', 1);
    await repo.transition(ped.id, 'tenant-1', 'en_preparacion', 2);
    await repo.transition(ped.id, 'tenant-1', 'despachado', 3);
    await repo.transition(ped.id, 'tenant-1', 'entregado', 4);
    const result = await getPedidos(repo, 'tenant-1');
    expect(result).toHaveLength(0);
  });
});

describe('order state machine (via repo.transition)', () => {
  it('flujo completo: creado → recibido → preparación → despachado → entregado', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'flow-1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    expect(ped.estado).toBe('creado');

    await repo.transition(ped.id, 'tenant-1', 'recibido_cocina', 1);
    expect(ped.estado).toBe('recibido_cocina');
    expect(ped.version).toBe(2);

    await repo.transition(ped.id, 'tenant-1', 'en_preparacion', 2);
    expect(ped.estado).toBe('en_preparacion');

    await repo.transition(ped.id, 'tenant-1', 'despachado', 3);
    expect(ped.estado).toBe('despachado');

    await repo.transition(ped.id, 'tenant-1', 'entregado', 4);
    expect(ped.estado).toBe('entregado');
  });

  it('rechaza transición inválida: creado → despachado', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'inv-1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await expect(repo.transition(ped.id, 'tenant-1', 'despachado', 1)).rejects.toThrow(
      'INVALID_TRANSITION',
    );
  });

  it('rechaza transición inválida: entregado → creado', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'inv-2',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await repo.transition(ped.id, 'tenant-1', 'recibido_cocina', 1);
    await repo.transition(ped.id, 'tenant-1', 'en_preparacion', 2);
    await repo.transition(ped.id, 'tenant-1', 'despachado', 3);
    await repo.transition(ped.id, 'tenant-1', 'entregado', 4);
    await expect(repo.transition(ped.id, 'tenant-1', 'creado', 5)).rejects.toThrow(
      'INVALID_TRANSITION',
    );
  });

  it('cancelación permitida desde creado', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'can-1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await repo.transition(ped.id, 'tenant-1', 'cancelado', 1);
    expect(ped.estado).toBe('cancelado');
  });

  it('optimistic locking: version incorrecta lanza VERSION_CONFLICT', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'opt-1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await expect(repo.transition(ped.id, 'tenant-1', 'recibido_cocina', 99)).rejects.toThrow(
      'VERSION_CONFLICT',
    );
  });

  it('pedido no existente lanza NOT_FOUND', async () => {
    const repo = createInMemoryRepo();
    await expect(repo.transition('no-existe', 'tenant-1', 'recibido_cocina', 1)).rejects.toThrow(
      'NOT_FOUND',
    );
  });

  it('tenant isolation: no transiciona pedido de otro tenant', async () => {
    const repo = createInMemoryRepo();
    const ped = await createPedido(repo, 'tenant-1', 'user-1', {
      zona: 'amex',
      idempotencyKey: 'iso-1',
      items: [{ recetaId: 'r1', cantidad: 1 }],
    });
    await expect(repo.transition(ped.id, 'tenant-2', 'recibido_cocina', 1)).rejects.toThrow(
      'NOT_FOUND',
    );
  });
});
