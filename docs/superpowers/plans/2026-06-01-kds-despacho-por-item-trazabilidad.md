# KDS — Despacho por ítem y área + Trazabilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar estado propio a cada ítem de pedido para que cada área de cocina avance y despache solo lo suyo, con trazabilidad append-only por ítem y una vista admin de trazabilidad del producto.

**Architecture:** Hexagonal por módulos (domain → application → infrastructure → actions.ts). El estado pasa del pedido al ítem; `pedidos.estado` se deriva del agregado de ítems. Eventos append-only en `pedido_item_eventos`. Tiempo real vía Socket.io (`ITEM_ESTADO`). Las acciones legacy de despacho a nivel pedido se **eliminan**.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Supabase/Postgres + RLS, Socket.io, Vitest, pnpm monorepo, next-intl, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-01-kds-despacho-por-item-trazabilidad-design.md`

**Convenciones del proyecto:**

- Solo `pnpm`. Tests: `pnpm --filter web test <path>` y `pnpm --filter @dorado/shared-types test`.
- Cada acción server: `assertCan` → validar → repo (optimistic `version`) → `auditLog` → emitir socket. Devuelve `Result<T>` (`ok`/`err`).
- Migraciones: idempotentes, RLS habilitada, sin `UPDATE/DELETE` sobre tablas de evento.

---

## File Structure

**Crear:**

- `supabase/migrations/20260601000001_kds_estado_por_item.sql` — estado/tiempos/actores en `pedido_items`, tabla `pedido_item_eventos`, backfill, RLS.
- `apps/web/src/modules/orders/domain/item-estado.ts` — `estadoPedidoDesdeItems()` (pura).
- `apps/web/src/modules/orders/application/transition-item.ts` — caso de uso de transición de ítem.
- `apps/web/src/modules/orders/application/get-trazabilidad.ts` — lectura para vista admin.
- `apps/web/src/app/(dashboard)/admin/trazabilidad/page.tsx` — página admin.
- `apps/web/src/components/admin/trazabilidad-panel.tsx` — tabla maestra + detalle.
- Tests: `apps/web/src/modules/orders/tests/item-estado.test.ts`, `item-transition.test.ts`.

**Modificar:**

- `packages/shared-types/src/enums.ts` — `EstadoItem` + `ITEM_TRANSITIONS`.
- `packages/shared-types/src/socket-events.ts` — `ItemEstadoEvent` + unión `SocketEvent`.
- `apps/web/src/modules/orders/domain/pedido.ts` — `PedidoItem` con estado/tiempos/actores.
- `apps/web/src/modules/orders/application/ports/order-repository.port.ts` — métodos de ítem.
- `apps/web/src/modules/orders/infrastructure/order-repository.ts` — impl de métodos de ítem.
- `apps/web/src/modules/orders/actions.ts` — `iniciarItem`/`marcarItemListo`/`recallItem`; eliminar `iniciarPreparacion`/`despacharPedido`; agregar `getTrazabilidadPedidos`/`getTrazaPedido`.
- `apps/web/src/components/kds/pedido-card.tsx` — acciones por ítem.
- `apps/web/src/components/kds/kds-board-area.tsx` — agregación por área.
- `apps/web/src/components/kds/kds-board-amex.tsx` — agregación por área AMEX.
- `apps/web/src/components/orders/pedido-table.tsx` — quitar llamadas legacy.
- `apps/web/src/messages/es.json` y `en.json` — claves nuevas.

---

## Phase 0 — Migración

### Task 0.1: Migración de estado por ítem + trazabilidad

**Files:**

- Create: `supabase/migrations/20260601000001_kds_estado_por_item.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- KDS: estado por ítem, tiempos/actores y log append-only de trazabilidad por producto.
-- Idempotente. RLS habilitada. pedido_item_eventos es append-only (sin UPDATE/DELETE en app).

-- 1) Estado y tiempos en pedido_items
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'en_preparacion', 'listo')),
  ADD COLUMN IF NOT EXISTS en_preparacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS listo_at timestamptz,
  ADD COLUMN IF NOT EXISTS iniciado_por uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS listo_por uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- 2) Log append-only por ítem
CREATE TABLE IF NOT EXISTS public.pedido_item_eventos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  pedido_id   uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.pedido_items(id) ON DELETE CASCADE,
  estado      text NOT NULL CHECK (estado IN ('pendiente', 'en_preparacion', 'listo')),
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_item_eventos_tenant_pedido
  ON public.pedido_item_eventos (tenant_id, pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_item_eventos_item_created
  ON public.pedido_item_eventos (item_id, created_at);

ALTER TABLE public.pedido_item_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedido_item_eventos_tenant_isolation ON public.pedido_item_eventos;
CREATE POLICY pedido_item_eventos_tenant_isolation ON public.pedido_item_eventos
  USING (tenant_id = public.current_tenant_id());

-- 3) Backfill del estado de ítems según el estado del pedido
UPDATE public.pedido_items it
SET estado = 'listo', listo_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id AND p.estado IN ('despachado', 'entregado');

UPDATE public.pedido_items it
SET estado = 'en_preparacion', en_preparacion_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id AND p.estado = 'en_preparacion';

COMMENT ON COLUMN public.pedido_items.estado IS 'KDS: pendiente|en_preparacion|listo. Despacho por área.';
COMMENT ON TABLE public.pedido_item_eventos IS 'Append-only: traza por ítem (quién/cuándo). Recalls = nueva fila.';
```

- [ ] **Step 2: Verificar el patrón de RLS existente**

Run: `grep -rn "current_tenant_id\|ENABLE ROW LEVEL SECURITY" supabase/migrations/20260514000002_pedido_eventos.sql`
Expected: confirmar el nombre de la función de tenant y el patrón de policy. Si difiere (p. ej. `app.current_tenant_id()`), ajustar la policy del Step 1 para que coincida exactamente.

- [ ] **Step 3: Aplicar la migración en local y verificar**

Run: `pnpm --filter web exec supabase db push` (o el comando de migración del proyecto; ver `package.json`/`docs`).
Expected: aplica sin error; `pedido_item_eventos` existe y `pedido_items` tiene la columna `estado`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260601000001_kds_estado_por_item.sql
git commit -m "feat(kds): migración estado por ítem + pedido_item_eventos + backfill"
```

---

## Phase 1 — Dominio y tipos (TDD)

### Task 1.1: `EstadoItem` + `ITEM_TRANSITIONS` en shared-types

**Files:**

- Modify: `packages/shared-types/src/enums.ts` (tras el bloque `PEDIDO_TRANSITIONS`, ~línea 148)
- Test: `packages/shared-types/src/tests/enums.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `packages/shared-types/src/tests/enums.test.ts`:

```ts
import { EstadoItem, ITEM_TRANSITIONS } from '../enums';

describe('EstadoItem + ITEM_TRANSITIONS', () => {
  it('tiene los 3 estados', () => {
    expect(Object.values(EstadoItem)).toEqual(['pendiente', 'en_preparacion', 'listo']);
  });
  it('cada estado tiene transiciones definidas', () => {
    for (const e of Object.values(EstadoItem)) {
      expect(ITEM_TRANSITIONS).toHaveProperty(e);
    }
  });
  it('listo solo retrocede a en_preparacion (recall)', () => {
    expect(ITEM_TRANSITIONS.listo).toEqual(['en_preparacion']);
  });
  it('las transiciones apuntan a estados válidos', () => {
    const valid = new Set(Object.values(EstadoItem));
    for (const targets of Object.values(ITEM_TRANSITIONS)) {
      for (const t of targets) expect(valid.has(t)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @dorado/shared-types test enums`
Expected: FAIL — `EstadoItem`/`ITEM_TRANSITIONS` no exportados.

- [ ] **Step 3: Implementar**

En `packages/shared-types/src/enums.ts`, después de `PEDIDO_TRANSITIONS`:

```ts
export const EstadoItem = {
  pendiente: 'pendiente',
  en_preparacion: 'en_preparacion',
  listo: 'listo',
} as const;

export type EstadoItem = (typeof EstadoItem)[keyof typeof EstadoItem];

export const ITEM_TRANSITIONS: Record<EstadoItem, EstadoItem[]> = {
  pendiente: ['en_preparacion'],
  en_preparacion: ['listo'],
  listo: ['en_preparacion'], // solo vía recall
};
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter @dorado/shared-types test enums`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/enums.ts packages/shared-types/src/tests/enums.test.ts
git commit -m "feat(shared-types): EstadoItem + ITEM_TRANSITIONS"
```

### Task 1.2: Extender el tipo de dominio `PedidoItem`

**Files:**

- Modify: `apps/web/src/modules/orders/domain/pedido.ts:7-16`

- [ ] **Step 1: Extender la interfaz**

Reemplazar la interfaz `PedidoItem` por:

```ts
import type { EstadoItem } from '@dorado/shared-types';

export interface PedidoItem {
  id: string;
  pedidoId: string;
  recetaId: string;
  recetaNombre: string;
  cantidad: number;
  notas: string | null;
  // Área productiva (KDS) a la que se ruteó el ítem al crear el pedido.
  areaProduccion: AreaProduccion | null;
  // Estado por ítem (KDS: despacho por área).
  estado: EstadoItem;
  enPreparacionAt: Date | null;
  listoAt: Date | null;
  iniciadoPor: string | null;
  listoPor: string | null;
}
```

Re-exportar el tipo junto a los demás (línea 4): añadir `EstadoItem`:

```ts
export type { EstadoPedido, ZonaServicio, AreaProduccion, EstadoItem };
```

- [ ] **Step 2: Verificar typecheck (rojo esperado en repo/mappers)**

Run: `pnpm --filter web typecheck`
Expected: errores en `order-repository.ts` (faltan los nuevos campos en el mapeo). Se corrigen en Task 2.2. No commitear aún si el typecheck global es gate; este task se commitea junto a 2.2. Continuar.

### Task 1.3: Función pura `estadoPedidoDesdeItems()`

**Files:**

- Create: `apps/web/src/modules/orders/domain/item-estado.ts`
- Test: `apps/web/src/modules/orders/tests/item-estado.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { estadoPedidoDesdeItems } from '../domain/item-estado';
import type { EstadoItem } from '@dorado/shared-types';

const items = (...estados: EstadoItem[]) => estados.map((estado) => ({ estado }));

describe('estadoPedidoDesdeItems', () => {
  it('todos pendiente y pedido ya recibido → recibido_cocina', () => {
    expect(estadoPedidoDesdeItems(items('pendiente', 'pendiente'), 'recibido_cocina')).toBe(
      'recibido_cocina',
    );
  });
  it('todos pendiente y pedido recién creado → creado', () => {
    expect(estadoPedidoDesdeItems(items('pendiente'), 'creado')).toBe('creado');
  });
  it('algún ítem en preparación → en_preparacion', () => {
    expect(estadoPedidoDesdeItems(items('pendiente', 'en_preparacion'), 'recibido_cocina')).toBe(
      'en_preparacion',
    );
  });
  it('todos listo → despachado', () => {
    expect(estadoPedidoDesdeItems(items('listo', 'listo'), 'en_preparacion')).toBe('despachado');
  });
  it('pedido entregado se mantiene (estado terminal)', () => {
    expect(estadoPedidoDesdeItems(items('listo'), 'entregado')).toBe('entregado');
  });
  it('pedido cancelado se mantiene', () => {
    expect(estadoPedidoDesdeItems(items('pendiente'), 'cancelado')).toBe('cancelado');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter web test item-estado`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```ts
import type { EstadoPedido, EstadoItem } from '@dorado/shared-types';

/** Estados terminales del pedido: no se derivan desde ítems. */
const TERMINALES: EstadoPedido[] = ['entregado', 'cancelado'];

/**
 * Deriva el estado del pedido a partir del estado agregado de sus ítems.
 * Pura. `estadoActual` se usa para respetar estados terminales y distinguir
 * 'creado' de 'recibido_cocina' cuando todos los ítems siguen pendientes.
 */
export function estadoPedidoDesdeItems(
  items: ReadonlyArray<{ estado: EstadoItem }>,
  estadoActual: EstadoPedido,
): EstadoPedido {
  if (TERMINALES.includes(estadoActual)) return estadoActual;
  if (items.length === 0) return estadoActual;

  if (items.every((i) => i.estado === 'listo')) return 'despachado';
  if (items.some((i) => i.estado === 'en_preparacion')) return 'en_preparacion';
  // todos pendiente
  return estadoActual === 'creado' ? 'creado' : 'recibido_cocina';
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter web test item-estado`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/orders/domain/item-estado.ts apps/web/src/modules/orders/tests/item-estado.test.ts apps/web/src/modules/orders/domain/pedido.ts
git commit -m "feat(orders): derivación de estado de pedido desde ítems + PedidoItem con estado"
```

---

## Phase 2 — Repo, acciones y socket

### Task 2.1: Evento socket `ITEM_ESTADO`

**Files:**

- Modify: `packages/shared-types/src/socket-events.ts` (tras `PedidoEstadoEvent`, ~línea 76; y la unión `SocketEvent` ~línea 191)

- [ ] **Step 1: Añadir el tipo de evento e incluirlo en la unión**

Tras `PedidoEstadoEvent`:

```ts
export interface ItemEstadoEvent {
  type: 'ITEM_ESTADO';
  payload: {
    pedidoId: string;
    itemId: string;
    tenantId: string;
    area: string; // AreaProduccion del ítem
    estadoAnterior: 'pendiente' | 'en_preparacion' | 'listo';
    estadoNuevo: 'pendiente' | 'en_preparacion' | 'listo';
    updatedAt: string;
  };
}
```

En `export type SocketEvent =` añadir `| ItemEstadoEvent` a la unión.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dorado/shared-types typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/socket-events.ts
git commit -m "feat(shared-types): evento socket ITEM_ESTADO"
```

### Task 2.2: Repo — leer/mapear estado de ítem y transición de ítem

**Files:**

- Modify: `apps/web/src/modules/orders/application/ports/order-repository.port.ts`
- Modify: `apps/web/src/modules/orders/infrastructure/order-repository.ts`
- Test: `apps/web/src/modules/orders/tests/item-transition.test.ts`

- [ ] **Step 1: Añadir métodos al puerto**

En `order-repository.port.ts`, dentro de `interface OrderRepository`, añadir:

```ts
  /** Lee un ítem con su pedido (para validar área, transición y tenant). */
  findItemForTransition(
    itemId: string,
    tenantId: string,
  ): Promise<{
    itemId: string;
    pedidoId: string;
    area: AreaProduccion | null;
    estado: EstadoItem;
    pedidoEstado: EstadoPedido;
    pedidoVersion: number;
    zona: string;
  } | null>;

  /**
   * Transición atómica de un ítem: setea estado/timestamps/actor del ítem,
   * inserta fila en pedido_item_eventos, recalcula pedidos.estado (optimistic
   * `version`) y devuelve el nuevo estado del pedido.
   */
  transitionItem(args: {
    itemId: string;
    pedidoId: string;
    tenantId: string;
    nuevoEstado: EstadoItem;
    actorId: string;
    pedidoVersion: number;
  }): Promise<{ pedidoEstado: EstadoPedido; pedidoVersion: number }>;
```

Añadir `EstadoItem` al import de tipos al inicio del archivo:

```ts
import type { /* ...existing... */ EstadoItem } from '../../domain/pedido';
```

- [ ] **Step 2: Escribir el test (in-memory repo) que falla**

Crear `item-transition.test.ts` siguiendo el patrón de `order-application.test.ts` (in-memory repo). Test mínimo del caso de uso `transitionItem` de aplicación (Task 2.3 lo consume); aquí validamos el contrato del repo en memoria:

```ts
import { describe, it, expect } from 'vitest';
import { estadoPedidoDesdeItems } from '../domain/item-estado';
import type { EstadoItem } from '@dorado/shared-types';

// Simula la recálculo que hará transitionItem en SQL: tras marcar listo el
// único ítem, el pedido deriva a 'despachado'.
describe('contrato transitionItem (derivación)', () => {
  it('marcar listo el último ítem deriva el pedido a despachado', () => {
    const itemsTrasMarcar: { estado: EstadoItem }[] = [{ estado: 'listo' }];
    expect(estadoPedidoDesdeItems(itemsTrasMarcar, 'en_preparacion')).toBe('despachado');
  });
});
```

- [ ] **Step 3: Correr y verificar que pasa (la derivación ya existe)**

Run: `pnpm --filter web test item-transition`
Expected: PASS. (Este test fija el contrato; la implementación SQL del Step 4 lo materializa.)

- [ ] **Step 4: Implementar en `order-repository.ts`**

Primero, en el mapeo de ítems del repo (buscar dónde se construyen los `PedidoItem`, métodos `findActive*`/`mapRow`), añadir los campos nuevos leídos del `select`. Ampliar el `.select('... pedido_items(...)')` para incluir `estado, en_preparacion_at, listo_at, iniciado_por, listo_por` y mapear:

```ts
estado: (it.estado ?? 'pendiente') as EstadoItem,
enPreparacionAt: it.en_preparacion_at ? new Date(it.en_preparacion_at) : null,
listoAt: it.listo_at ? new Date(it.listo_at) : null,
iniciadoPor: it.iniciado_por ?? null,
listoPor: it.listo_por ?? null,
```

Luego añadir los métodos nuevos:

```ts
async findItemForTransition(itemId: string, tenantId: string) {
  const { data, error } = await this.client
    .from('pedido_items')
    .select('id, estado, area_produccion, pedido_id, pedidos!inner(estado, version, zona, tenant_id)')
    .eq('id', itemId)
    .eq('pedidos.tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new AppError('DB_ERROR', 500, error.message);
  if (!data) return null;
  const p = data.pedidos as unknown as { estado: EstadoPedido; version: number; zona: string };
  return {
    itemId: data.id as string,
    pedidoId: data.pedido_id as string,
    area: (data.area_produccion ?? null) as AreaProduccion | null,
    estado: (data.estado ?? 'pendiente') as EstadoItem,
    pedidoEstado: p.estado,
    pedidoVersion: p.version,
    zona: p.zona,
  };
},

async transitionItem(args) {
  const { itemId, pedidoId, tenantId, nuevoEstado, actorId, pedidoVersion } = args;
  const now = new Date().toISOString();

  // 1) Actualizar el ítem (estado + timestamp/actor según destino)
  const itemPatch: Record<string, unknown> = { estado: nuevoEstado };
  if (nuevoEstado === 'en_preparacion') {
    itemPatch['en_preparacion_at'] = now;
    itemPatch['iniciado_por'] = actorId;
  } else if (nuevoEstado === 'listo') {
    itemPatch['listo_at'] = now;
    itemPatch['listo_por'] = actorId;
  }
  const { error: upErr } = await this.client
    .from('pedido_items')
    .update(itemPatch)
    .eq('id', itemId)
    .eq('pedido_id', pedidoId);
  if (upErr) throw new AppError('DB_ERROR', 500, upErr.message);

  // 2) Insertar evento append-only
  const { error: evErr } = await this.client
    .from('pedido_item_eventos')
    .insert({ tenant_id: tenantId, pedido_id: pedidoId, item_id: itemId, estado: nuevoEstado, actor_id: actorId });
  if (evErr) throw new AppError('DB_ERROR', 500, evErr.message);

  // 3) Recalcular estado del pedido desde sus ítems
  const { data: itemsRows, error: itErr } = await this.client
    .from('pedido_items')
    .select('estado')
    .eq('pedido_id', pedidoId);
  if (itErr) throw new AppError('DB_ERROR', 500, itErr.message);

  const { data: pedRow } = await this.client
    .from('pedidos')
    .select('estado')
    .eq('id', pedidoId)
    .eq('tenant_id', tenantId)
    .single();

  const nuevoEstadoPedido = estadoPedidoDesdeItems(
    (itemsRows ?? []) as { estado: EstadoItem }[],
    (pedRow?.estado ?? 'recibido_cocina') as EstadoPedido,
  );

  // 4) Persistir estado derivado con optimistic locking
  const { data: updated, error: pErr } = await this.client
    .from('pedidos')
    .update({ estado: nuevoEstadoPedido, version: pedidoVersion + 1, updated_at: now })
    .eq('id', pedidoId)
    .eq('tenant_id', tenantId)
    .eq('version', pedidoVersion)
    .select('estado, version')
    .single();
  if (pErr || !updated) throw new AppError('VERSION_CONFLICT', 409, 'El pedido cambió, recarga.');

  return { pedidoEstado: updated.estado as EstadoPedido, pedidoVersion: updated.version as number };
},
```

Importar `estadoPedidoDesdeItems` y `EstadoItem` al inicio del archivo. (Nota: `this.client` es el patrón actual del repo; verificar el nombre real del cliente en el archivo y respetarlo.)

- [ ] **Step 5: Typecheck y tests**

Run: `pnpm --filter web typecheck && pnpm --filter web test item`
Expected: PASS (los errores de Task 1.2 quedan resueltos al mapear los campos nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/orders/application/ports/order-repository.port.ts apps/web/src/modules/orders/infrastructure/order-repository.ts apps/web/src/modules/orders/tests/item-transition.test.ts
git commit -m "feat(orders): repo transitionItem + findItemForTransition + mapeo estado de ítem"
```

### Task 2.3: Acciones server `iniciarItem` / `marcarItemListo` / `recallItem`

**Files:**

- Modify: `apps/web/src/modules/orders/actions.ts`

- [ ] **Step 1: Añadir imports y el mapa de permisos de escritura por área**

En la cabecera de `actions.ts` añadir:

```ts
import { ITEM_TRANSITIONS } from '@dorado/shared-types';
import type { EstadoItem } from './domain/pedido';
```

Tras `AREA_KDS_PERM` (~línea 99) añadir:

```ts
const AREA_WRITE_PERM: Partial<Record<AreaProduccion, string>> = {
  cocina_fria: 'cocina_fria:write',
  cocina_caliente: 'cocina_caliente:write',
  amex: 'cocina_amex:write',
};
```

- [ ] **Step 2: Implementar el helper de transición y las tres acciones**

Añadir al final del archivo. Resuelve el tenant del actor con `orders:read`, luego exige el permiso de escritura del área del ítem (aislamiento entre áreas):

```ts
async function ejecutarTransicionItem(
  itemId: string,
  version: number,
  nuevoEstado: EstadoItem,
  accionAudit: string,
): Promise<Result<{ pedidoEstado: string }>> {
  try {
    // 1) Resolver tenant del actor con un permiso base de cocina (cualquiera de área lo tiene).
    //    Usamos 'orders:read' para obtener ctx.tenantId/userId sin filtrar entre áreas.
    const ctxBase = await assertCan('orders:read');
    const repo = createOrderRepository();

    const item = await repo.findItemForTransition(itemId, ctxBase.tenantId);
    if (!item) return err(new AppError('NOT_FOUND', 404, 'Ítem no encontrado'));
    if (item.area === null) {
      return err(new AppError('VALIDATION', 400, 'El ítem no tiene área productiva asignada'));
    }

    // 2) Exigir el permiso de ESCRITURA del área del ítem (un chef de fría no toca caliente).
    const perm = AREA_WRITE_PERM[item.area];
    if (!perm) return err(new AppError('VALIDATION', 400, `Área sin despacho KDS: ${item.area}`));
    const ctx = await assertCan(perm);

    // 3) Validar transición de ítem.
    if (!ITEM_TRANSITIONS[item.estado].includes(nuevoEstado)) {
      return err(
        new AppError(
          'INVALID_TRANSITION',
          400,
          `No se puede pasar el ítem de '${item.estado}' a '${nuevoEstado}'`,
        ),
      );
    }
    // Recall: solo si el pedido no es terminal.
    if (nuevoEstado === 'en_preparacion' && item.estado === 'listo') {
      if (['entregado', 'cancelado'].includes(item.pedidoEstado)) {
        return err(
          new AppError('INVALID_TRANSITION', 400, 'No se puede hacer recall de un pedido cerrado'),
        );
      }
    }

    const result = await repo.transitionItem({
      itemId,
      pedidoId: item.pedidoId,
      tenantId: ctx.tenantId,
      nuevoEstado,
      actorId: ctx.userId,
      pedidoVersion: version,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: accionAudit,
      resourceId: itemId,
      resourceType: 'pedido_item',
      payload: { area: item.area, nuevoEstado, pedidoId: item.pedidoId },
    });

    const updatedAt = new Date().toISOString();
    await emitEvent(ctx.tenantId, CHANNELS.COCINA, {
      type: 'ITEM_ESTADO',
      payload: {
        pedidoId: item.pedidoId,
        itemId,
        tenantId: ctx.tenantId,
        area: item.area,
        estadoAnterior: item.estado,
        estadoNuevo: nuevoEstado,
        updatedAt,
      },
    });
    if (item.area === 'amex') {
      await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, {
        type: 'ITEM_ESTADO',
        payload: {
          pedidoId: item.pedidoId,
          itemId,
          tenantId: ctx.tenantId,
          area: item.area,
          estadoAnterior: item.estado,
          estadoNuevo: nuevoEstado,
          updatedAt,
        },
      });
    }
    // Si el pedido derivó a despachado, avisar al mesero (contrato existente).
    if (result.pedidoEstado === 'despachado') {
      await emitEvent(ctx.tenantId, CHANNELS.AMEX, {
        type: 'PEDIDO_ESTADO',
        payload: {
          pedidoId: item.pedidoId,
          tenantId: ctx.tenantId,
          estadoAnterior: item.pedidoEstado,
          estadoNuevo: 'despachado',
          zona: item.zona as never,
          updatedAt,
        },
      });
    }

    void registrarEvento(ctx.tenantId, item.pedidoId, result.pedidoEstado, ctx.userId);
    return ok({ pedidoEstado: result.pedidoEstado });
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function iniciarItem(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'en_preparacion', 'orders:iniciar_item');
}
export async function marcarItemListo(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'listo', 'orders:marcar_item_listo');
}
export async function recallItem(itemId: string, version: number) {
  return ejecutarTransicionItem(itemId, version, 'en_preparacion', 'orders:recall_item');
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modules/orders/actions.ts
git commit -m "feat(orders): acciones iniciarItem/marcarItemListo/recallItem por área"
```

### Task 2.4: Eliminar acciones legacy de despacho a nivel pedido

**Files:**

- Modify: `apps/web/src/modules/orders/actions.ts` (eliminar `iniciarPreparacion` ~251-301 y `despacharPedido` ~367-417)

- [ ] **Step 1: Eliminar las dos funciones**

Borrar las exportaciones `iniciarPreparacion` y `despacharPedido` completas. Conservar `recibirEnCocina`, `entregarPedido`, `cancelarPedido`, `asignarCocinero`.

- [ ] **Step 2: Encontrar consumidores**

Run: `grep -rn "iniciarPreparacion\|despacharPedido" apps/web/src --include=*.tsx --include=*.ts`
Expected: aparecen `components/kds/pedido-card.tsx` y `components/orders/pedido-table.tsx`. Se migran en Phase 3.

- [ ] **Step 3: Typecheck (rojo esperado en los 2 consumidores)**

Run: `pnpm --filter web typecheck`
Expected: errores SOLO en `pedido-card.tsx` y `pedido-table.tsx`. Se resuelven en Phase 3. No commitear hasta Task 3.1/3.4 (commit conjunto) para no dejar `main` roto.

---

## Phase 3 — Tableros KDS

### Task 3.1: `pedido-card.tsx` — acciones por ítem

**Files:**

- Modify: `apps/web/src/components/kds/pedido-card.tsx`
- Modify: `apps/web/src/messages/es.json`, `apps/web/src/messages/en.json`

- [ ] **Step 1: Añadir claves i18n**

En el namespace `kds` de `es.json`: `"iniciarItem": "Iniciar", "marcarListo": "Listo", "recall": "Reabrir", "progresoArea": "{n}/{total} listos"`. Equivalentes en `en.json`.

- [ ] **Step 2: Reescribir la sección de acciones por ítem**

Sustituir las acciones de pedido (botones `iniciarPreparacion`/`despacharPedido`) por acciones por ítem. La tarjeta recibe `area` para filtrar y actuar solo sobre ítems de esa área:

```tsx
import { iniciarItem, marcarItemListo, recallItem } from '@/modules/orders/actions';
import type { AreaProduccion } from '@/modules/orders/domain/pedido';

interface PedidoCardProps {
  pedido: PedidoWithItems;
  area: AreaProduccion; // área del tablero
  pedidoVersion: number;
  onRefresh?: () => void;
  readOnly?: boolean | undefined;
}
```

Renderizar por cada ítem del área (`pedido.items.filter(i => i.areaProduccion === area)`):

```tsx
{
  itemsArea.map((item) => (
    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className="font-medium">{item.cantidad}×</span> {item.recetaNombre}
      </span>
      {!readOnly && (
        <span className="flex gap-1">
          {item.estado === 'pendiente' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => act(item.id, iniciarItem)}
              disabled={loading}
            >
              {t('iniciarItem')}
            </Button>
          )}
          {item.estado === 'en_preparacion' && (
            <Button size="sm" onClick={() => act(item.id, marcarItemListo)} disabled={loading}>
              {t('marcarListo')}
            </Button>
          )}
          {item.estado === 'listo' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => act(item.id, recallItem)}
              disabled={loading}
            >
              {t('recall')}
            </Button>
          )}
        </span>
      )}
    </li>
  ));
}
```

Con un handler genérico:

```tsx
const act = async (
  itemId: string,
  fn: (
    id: string,
    v: number,
  ) => Promise<{ ok: boolean; error?: { message: string; code?: string } }>,
) => {
  setLoading(true);
  const res = await fn(itemId, pedidoVersion);
  setLoading(false);
  if (!('ok' in res) || !res.ok) {
    toast.error(res.error?.message ?? 'Error');
    if (res.error?.code === 'VERSION_CONFLICT') onRefresh?.();
    return;
  }
  onRefresh?.();
};
```

(La firma exacta de `Result` está en `@/lib/result`; respetar su forma real al tipar `fn`.)

- [ ] **Step 3: Barra de progreso del área**

Añadir bajo los ítems: `{t('progresoArea', { n: itemsArea.filter(i => i.estado === 'listo').length, total: itemsArea.length })}`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: el error de `pedido-card.tsx` desaparece (sigue el de `pedido-table.tsx` hasta Task 3.4).

### Task 3.2: `kds-board-area.tsx` — columnas por estado agregado del área

**Files:**

- Modify: `apps/web/src/components/kds/kds-board-area.tsx`

- [ ] **Step 1: Derivar el estado del pedido _para esta área_**

Añadir una función local que clasifica un pedido en una columna según SUS ítems del área:

```tsx
function estadoAreaDePedido(
  pedido: PedidoWithItems,
  area: AreaProduccion,
): 'creado' | 'en_preparacion' | 'despachado' {
  const items = pedido.items.filter((i) => i.areaProduccion === area);
  if (items.length === 0) return 'despachado'; // no aplica a esta área
  if (items.every((i) => i.estado === 'listo')) return 'despachado';
  if (items.some((i) => i.estado === 'en_preparacion')) return 'en_preparacion';
  return 'creado';
}
```

- [ ] **Step 2: Reemplazar `byState`**

Cambiar el filtro por estado del pedido por el estado-de-área:

```tsx
const byState = (estado: ColumnDef['key']) =>
  pedidos
    .filter((p) => estadoAreaDePedido(p, area) === estado)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
```

- [ ] **Step 3: Pasar `area` y `version` a `PedidoCard`**

```tsx
<PedidoCard
  key={pedido.id}
  pedido={pedido}
  area={area}
  pedidoVersion={pedido.version}
  onRefresh={refresh}
  readOnly={readOnly}
/>
```

- [ ] **Step 4: Actualizar listener socket a `ITEM_ESTADO`**

En el `handleEvent`, añadir: `if (event.type === 'ITEM_ESTADO') refresh();` y mantener `PEDIDO_CREADO`/`PEDIDO_ESTADO` para altas y cierre.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores nuevos en este archivo.

### Task 3.3: `kds-board-amex.tsx` — misma agregación para área AMEX

**Files:**

- Modify: `apps/web/src/components/kds/kds-board-amex.tsx`

- [ ] **Step 1: Aplicar el mismo patrón de Task 3.2 con `area = 'amex'`**

Reutilizar `estadoAreaDePedido` (extraerla a un helper compartido `kds/area-estado.ts` si ambos tableros la usan — DRY). Pasar `area="amex"` y `pedidoVersion` a `PedidoCard`. Escuchar `ITEM_ESTADO` en `CHANNELS.COCINA_AMEX`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores nuevos.

### Task 3.4: `pedido-table.tsx` — quitar acciones legacy

**Files:**

- Modify: `apps/web/src/components/orders/pedido-table.tsx`

- [ ] **Step 1: Quitar imports y botones de `iniciarPreparacion`/`despacharPedido`**

La tabla `/pedidos` es una vista de seguimiento. Eliminar los botones de iniciar/despachar (esas acciones ahora son por ítem en el KDS). Conservar `recibirEnCocina`, `entregarPedido`, `cancelarPedido` y el historial. Mostrar el estado derivado (read-only) y, opcionalmente, el progreso de ítems (`n/total listos`).

- [ ] **Step 2: Typecheck completo del repo**

Run: `pnpm --filter web typecheck`
Expected: PASS (ya no quedan consumidores de las acciones legacy).

- [ ] **Step 3: Tests + lint**

Run: `pnpm --filter web test && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 4: Commit (Phase 2.4 + Phase 3 juntas — árbol consistente)**

```bash
git add apps/web/src/modules/orders/actions.ts apps/web/src/components/kds/ apps/web/src/components/orders/pedido-table.tsx apps/web/src/messages/es.json apps/web/src/messages/en.json
git commit -m "feat(kds): despacho por ítem en tableros + baja de acciones legacy de pedido"
```

- [ ] **Step 5: Verificación manual en localhost**

Run: levantar `pnpm dev`, entrar a `/cocina-caliente` y `/cocina-fria` con un pedido multi-área; iniciar/marcar listo ítems por área; confirmar que el pedido pasa a "despachado" solo cuando todas las áreas terminan, y que el recall reabre un ítem.

---

## Phase 4 — Vista admin de trazabilidad

### Task 4.1: Acciones de lectura `getTrazabilidadPedidos` / `getTrazaPedido`

**Files:**

- Create: `apps/web/src/modules/orders/application/get-trazabilidad.ts`
- Modify: `apps/web/src/modules/orders/actions.ts`

- [ ] **Step 1: Definir tipos y casos de uso**

En `get-trazabilidad.ts`:

```ts
export interface TrazaFiltros {
  desde?: string;
  hasta?: string;
  zona?: string;
  estado?: string;
  responsableId?: string;
  mesa?: string;
  limit?: number;
  offset?: number;
}

export interface TrazaItemEvento {
  itemId: string;
  recetaNombre: string;
  area: string | null;
  cantidad: number;
  estado: string;
  actorId: string | null;
  actorNombre: string | null;
  at: string;
}

export interface TrazaPedidoDetalle {
  pedidoId: string;
  zona: string;
  numeroMesa: string | null;
  estado: string;
  creadoPor: string | null;
  cocineroId: string | null;
  createdAt: string;
  timeline: Array<{
    tipo: 'pedido' | 'item';
    estado: string;
    actorNombre: string | null;
    at: string;
    itemNombre?: string;
  }>;
}
```

Las funciones reciben un `repo`/cliente admin y arman la consulta (join de actores como `getEventosPedido`).

- [ ] **Step 2: Exponer las acciones en `actions.ts`**

```ts
export async function getTrazabilidadPedidos(filtros: TrazaFiltros): Promise<Result<...>> {
  try {
    const ctx = await assertCan('orders:read'); // panel admin restringe a admin/superuser por rol
    const admin = createAdminClient();
    // SELECT pedidos + pedido_items (cantidad/area/estado) con filtros desde/hasta/zona/estado/mesa,
    // paginado con limit/offset, eq tenant_id = ctx.tenantId, order by created_at desc.
    // ... (mapear filas a la lista maestra)
  } catch (e) { return err(toAppError(e)); }
}

export async function getTrazaPedido(pedidoId: string): Promise<Result<TrazaPedidoDetalle>> {
  try {
    const ctx = await assertCan('orders:read');
    const admin = createAdminClient();
    // 1) pedido + items
    // 2) pedido_eventos (estado, actor_id, created_at)
    // 3) pedido_item_eventos (item_id, estado, actor_id, created_at)
    // 4) resolver nombres de actor (in users) y FUSIONAR 2+3 en timeline ordenada por at asc.
  } catch (e) { return err(toAppError(e)); }
}
```

(Reutilizar el patrón de resolución de actores de `getEventosPedido`, líneas ~566-573 de `actions.ts`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modules/orders/application/get-trazabilidad.ts apps/web/src/modules/orders/actions.ts
git commit -m "feat(orders): lectura de trazabilidad (lista maestra + timeline por pedido)"
```

### Task 4.2: Página `/admin/trazabilidad` + panel

**Files:**

- Create: `apps/web/src/app/(dashboard)/admin/trazabilidad/page.tsx`
- Create: `apps/web/src/components/admin/trazabilidad-panel.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx` (entrada de menú admin)
- Modify: `apps/web/src/messages/es.json`, `en.json`

- [ ] **Step 1: Página server (patrón de las otras páginas admin)**

```tsx
import { assertCan } from '@/lib/auth/assertCan';
import { getTrazabilidadPedidos } from '@/modules/orders/actions';
import { TrazabilidadPanel } from '@/components/admin/trazabilidad-panel';

export default async function TrazabilidadPage() {
  await assertCan('orders:read');
  const res = await getTrazabilidadPedidos({ limit: 50 });
  return <TrazabilidadPanel initial={res.ok ? res.value : []} />;
}
```

(Verificar el patrón exacto de las páginas admin existentes, p. ej. `admin/personal/page.tsx`, y seguirlo: layout, manejo de `!res.ok`, etc.)

- [ ] **Step 2: Panel cliente — tabla maestra + fila expandible**

`trazabilidad-panel.tsx`: filtros (fecha, zona, estado, mesa, responsable), tabla con columnas (fecha, origen/zona, mesa, estado, responsable, #ítems), y al expandir una fila llama `getTrazaPedido(pedidoId)` y muestra la línea de tiempo fusionada + ítems (cantidad, área, estado, quién/cuándo). Reutilizar componentes `Table`/`Badge` existentes (ver `pedido-table.tsx`).

- [ ] **Step 3: Entrada en el sidebar admin**

Añadir el ítem de menú "Trazabilidad" en la sección admin de `sidebar.tsx`, visible para admin/superuser (seguir el patrón de las otras entradas admin). Claves i18n correspondientes.

- [ ] **Step 4: Typecheck + lint + test**

Run: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Verificación manual**

Run: en `pnpm dev`, entrar como admin a `/admin/trazabilidad`; verificar filtros, expansión de fila, timeline con responsables/horas, cantidades y área por ítem.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/admin/trazabilidad apps/web/src/components/admin/trazabilidad-panel.tsx apps/web/src/components/layout/sidebar.tsx apps/web/src/messages/es.json apps/web/src/messages/en.json
git commit -m "feat(admin): vista de trazabilidad de pedidos (origen, responsables, tiempos, timeline)"
```

---

## Cierre

- [ ] **Suite completa verde**

Run: `pnpm --filter web test && pnpm --filter @dorado/shared-types test && pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Smoke manual por rol** (ver `docs/qa/ui-smoke-checklist.md`): chef_cocina_fria, chef_cocina_caliente, sous_chef (AMEX), mesero_amex (recibe despacho), admin (trazabilidad).

- [ ] **Push de la rama**

```bash
git push origin feature/refoco-operacional
```

---

## Notas de implementación

- **Pastelería:** el área `pasteleria` no tiene tablero en este alcance ni permiso `:write` dedicado; sus ítems se ven en la vista admin de trazabilidad. Si se requiere despacho de pastelería, añadir `pasteleria:write` y un tablero en un plan posterior.
- **Área legacy `cocina`:** ítems con `area_produccion = 'cocina'` (pre-split) no aparecen en tableros de área; quedan consistentes por el backfill y visibles en trazabilidad.
- **No dejar doble camino:** verificar con el `grep` del Task 2.4 que no quede ningún consumidor de `iniciarPreparacion`/`despacharPedido` antes del commit de Phase 3.
- **Patrón de cliente del repo / RLS:** confirmar el nombre real del cliente Supabase en `order-repository.ts` y la función de tenant en las migraciones existentes; el plan usa `this.client` y `current_tenant_id()` como referencia.
