import { PEDIDO_TRANSITIONS } from '../../domain/pedido';
import type {
  Pedido,
  PedidoWithItems,
  PedidoForDelivery,
  CreatePedidoInput,
  EstadoPedido,
  AreaProduccion,
} from '../../domain/pedido';
import type { OrderRepository } from '../../application/ports/order-repository.port';

// Doble en memoria del OrderRepository, compartido por las pruebas de aplicación.
//
// Antes cada archivo de prueba mantenía su propia copia (cuatro variantes de
// ~120 líneas que ya habían divergido). Con el puerto centralizado, un cambio de
// contrato se refleja en un solo sitio.

export const EMPTY_TIMESTAMPS = {
  recibidoCocinaAt: null,
  enPreparacionAt: null,
  despachadoAt: null,
  entregadoAt: null,
  canceladoAt: null,
};

export function makePedido(overrides: Partial<PedidoWithItems> = {}): PedidoWithItems {
  return {
    id: 'ped-1',
    tenantId: 'tenant-1',
    numeroMesa: 'M1',
    zona: 'amex',
    estado: 'creado',
    version: 1,
    notas: null,
    cocineroId: null,
    items: [],
    timestamps: { ...EMPTY_TIMESTAMPS },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// `recetaAreas`: área por recetaId que devolverá findRecetaAreas. Por defecto
// 'cocina_fria' (permitida para AMEX, Snack y Buffet) para que los pedidos de
// prueba ruteen sin violar la matriz salvo que el test lo configure aposta.
export function createInMemoryRepo(
  recetaAreas: Record<string, AreaProduccion | null> = {},
): OrderRepository & { pedidos: PedidoWithItems[] } {
  const pedidos: PedidoWithItems[] = [];
  // Refleja el índice único (tenant_id, idempotency_key) de `pedidos`: un
  // segundo envío con la misma clave falla como DUPLICATE_PEDIDO.
  const clavesVistas = new Set<string>();
  let counter = 0;

  return {
    pedidos,
    async findRecetaAreas(_tenantId: string, recetaIds: string[]) {
      const out: Record<string, AreaProduccion | null> = {};
      for (const id of recetaIds) {
        out[id] = id in recetaAreas ? recetaAreas[id]! : 'cocina_fria';
      }
      return out;
    },
    async findActive(tenantId: string) {
      return pedidos.filter(
        (p) => p.tenantId === tenantId && p.estado !== 'entregado' && p.estado !== 'cancelado',
      );
    },
    async findActiveByZona(tenantId: string, zona: string) {
      return pedidos.filter(
        (p) =>
          p.tenantId === tenantId &&
          p.zona === zona &&
          p.estado !== 'entregado' &&
          p.estado !== 'cancelado',
      );
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
        .filter((p) => p.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
    async create(
      tenantId: string,
      userId: string,
      input: CreatePedidoInput,
      itemAreas: Record<string, AreaProduccion>,
    ) {
      const claveIdempotencia = `${tenantId}:${input.idempotencyKey}`;
      if (clavesVistas.has(claveIdempotencia)) throw new Error('DUPLICATE_PEDIDO');
      clavesVistas.add(claveIdempotencia);

      void userId;
      counter++;
      const ped = makePedido({
        id: `ped-${counter}`,
        tenantId,
        zona: input.zona,
        numeroMesa: input.numeroMesa ?? null,
        notas: input.notas ?? null,
        items: input.items.map((it, idx) => ({
          id: `item-${counter}-${idx}`,
          pedidoId: `ped-${counter}`,
          recetaId: it.recetaId,
          recetaNombre: `Receta ${idx + 1}`,
          cantidad: it.cantidad,
          notas: it.notas ?? null,
          areaProduccion: itemAreas[it.recetaId] ?? null,
          estado: 'pendiente' as const,
          enPreparacionAt: null,
          listoAt: null,
          iniciadoPor: null,
          listoPor: null,
        })),
      });
      pedidos.push(ped);
      return ped;
    },
    async findByIdForDelivery(id: string, tenantId: string): Promise<PedidoForDelivery | null> {
      const p = pedidos.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) return null;
      return {
        ...p,
        items: p.items.map((it) => ({
          ...it,
          recetaPorciones: 1,
          recetaTipo: 'servicio' as const,
          ingredientes: [],
        })),
      };
    },
    async transition(id: string, tenantId: string, estado: EstadoPedido, version: number) {
      const p = pedidos.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) throw new Error('NOT_FOUND');
      if (p.version !== version) throw new Error('VERSION_CONFLICT');
      const allowed = PEDIDO_TRANSITIONS[p.estado];
      if (!allowed.includes(estado)) {
        throw new Error(`INVALID_TRANSITION: ${p.estado} → ${estado}`);
      }
      p.estado = estado;
      p.version++;
      p.updatedAt = new Date();
      return p;
    },
    // La entrega real ocurre en fn_entregar_pedido (una transacción de Postgres).
    // El doble en memoria reproduce su contrato: transición + versión.
    async entregar(id: string, tenantId: string, version: number) {
      const p = pedidos.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) throw new Error('NOT_FOUND');
      if (p.version !== version) throw new Error('VERSION_CONFLICT');
      if (!PEDIDO_TRANSITIONS[p.estado].includes('entregado')) {
        throw new Error(`INVALID_TRANSITION: ${p.estado} → entregado`);
      }
      p.estado = 'entregado';
      p.version++;
      p.updatedAt = new Date();
      return p;
    },
    async asignarCocinero(id: string, tenantId: string, cocineroId: string, version: number) {
      const p = pedidos.find((x) => x.id === id && x.tenantId === tenantId);
      if (!p) throw new Error('NOT_FOUND');
      if (p.version !== version) throw new Error('VERSION_CONFLICT');
      p.cocineroId = cocineroId;
      p.version++;
      p.updatedAt = new Date();
      return p;
    },
    async findByTurnoZona(tenantId: string, turnoId: string, zona: string) {
      void turnoId;
      return await this.findActiveByZona(tenantId, zona);
    },
    async findItemForTransition() {
      return null;
    },
    async transitionItem() {
      return { pedidoEstado: 'recibido_cocina' as const, pedidoVersion: 1 };
    },
  };
}
