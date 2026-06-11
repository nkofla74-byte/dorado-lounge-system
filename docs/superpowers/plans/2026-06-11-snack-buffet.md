# Frente 1 — Snack & Buffet: Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UIs dedicadas `/snack` y `/buffet` con roles propios, pedidos por elaboración (recetas tipo `produccion`) ruteados a los KDS, sin doble descuento de inventario, con disponibilidad, historial y métricas del turno.

**Architecture:** Extiende el módulo `orders` (no se crea módulo nuevo). Contratos primero en `packages/shared-types` (roles + canales). El descuento FEFO de elaboraciones ocurre SOLO en `fn_completar_tanda`; la entrega de ítems tipo `produccion` se excluye en `calcularDescuentosPedido` (capa application, pura). Trazabilidad pedido↔producción vía `tandas_produccion.pedido_item_id`.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · Supabase (RLS) · Socket.io · Zod + RHF · next-intl · Vitest · Playwright.

**Spec:** `docs/superpowers/specs/2026-06-11-cierre-operacional-design.md`

**Regla de oro (Principio Rector):** Nada sale de cocina sin receta. El FEFO de elaboraciones ya corre en `fn_completar_tanda` — la entrega NO debe volver a descontar. Test obligatorio en Task 4.

**Hechos verificados del codebase (no re-descubrir):**

- El enum SQL `public.user_role` YA contiene `personal_snack` y `personal_buffet` (migración 0001). Solo falta TypeScript.
- `fn_crear_pedido` es SECURITY INVOKER → la RLS aplica. Las políticas `pedidos_modify_mesero` y `pedido_items_modify_mesero` (migración 0005) solo permiten `'superuser','admin','chef','sous_chef','mesero_amex'` — hay que extenderlas (Task 3). Esto además corrige el hueco latente de `chef_cocina_fria`/`chef_cocina_caliente`/`personal_pasteleria` que hoy no están en esas políticas pero operan ítems.
- `recetas.porciones integer NOT NULL DEFAULT 1` = tamaño del batch estándar. `recetas.tipo_receta` = `produccion | servicio`. `recetas.area_produccion` existe (nullable).
- `tandas_produccion.zona_destino` existe (migración 20260522000000).
- `ZONA_AREAS_PERMITIDAS` en shared-types ya rutea snack/buffet → `cocina_caliente|cocina_fria|pasteleria`.
- `apps/web/src/lib/auth/role-home.test.ts` ya existe — se extiende, no se crea.
- Comandos: `pnpm --filter apps/web test -- <pattern>` · `pnpm --filter apps/web tsc --noEmit` · `pnpm lint`.
- Commits en español, Conventional Commits. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>.

---

### Task 0: Rama de trabajo

**Files:** ninguno (git).

- [ ] **Step 1: Crear rama desde main actualizado**

```bash
cd /home/jrxdevs/dorado-lounge-system
git checkout main && git pull origin main
git checkout -b feature/snack-buffet
```

Expected: `Switched to a new branch 'feature/snack-buffet'`

---

### Task 1: Roles en contratos TypeScript + auth/routing

**Files:**

- Modify: `packages/shared-types/src/enums.ts:1-14`
- Modify: `apps/web/src/lib/auth/role-home.ts`
- Modify: `apps/web/src/lib/auth/permissions.ts`
- Test: `apps/web/src/lib/auth/role-home.test.ts` (ya existe — agregar casos)

> Los tres archivos van en UNA tarea: agregar roles a `UserRole` rompe la exhaustividad de `Record<UserRole, …>` en role-home.ts hasta que se agreguen sus entradas. El typecheck solo queda verde con los tres juntos.

- [ ] **Step 1: Agregar tests que fallan en `role-home.test.ts`**

Agregar al final del describe existente (ajustar al estilo del archivo):

```typescript
describe('roles de zona snack/buffet', () => {
  it('personal_snack aterriza en /snack y solo accede a /snack', () => {
    expect(ROLE_HOME.personal_snack).toBe('/snack');
    expect(canAccess('personal_snack', '/snack')).toBe(true);
    expect(canAccess('personal_snack', '/buffet')).toBe(false);
    expect(canAccess('personal_snack', '/pedidos')).toBe(false);
    expect(canAccess('personal_snack', '/inventario')).toBe(false);
  });

  it('personal_buffet aterriza en /buffet y solo accede a /buffet', () => {
    expect(ROLE_HOME.personal_buffet).toBe('/buffet');
    expect(canAccess('personal_buffet', '/buffet')).toBe(true);
    expect(canAccess('personal_buffet', '/snack')).toBe(false);
  });

  it('admin puede auditar /snack y /buffet', () => {
    expect(canAccess('admin', '/snack')).toBe(true);
    expect(canAccess('admin', '/buffet')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm --filter apps/web test -- role-home
```

Expected: FAIL — TypeScript error (`personal_snack` no existe en `UserRole`) o assertion fail.

- [ ] **Step 3: Agregar los roles a `UserRole` en `packages/shared-types/src/enums.ts`**

```typescript
export const UserRole = {
  superuser: 'superuser',
  admin: 'admin',
  chef: 'chef',
  chef_cocina_fria: 'chef_cocina_fria',
  chef_cocina_caliente: 'chef_cocina_caliente',
  sous_chef: 'sous_chef',
  mesero_amex: 'mesero_amex',
  personal_almacen: 'personal_almacen',
  personal_pasteleria: 'personal_pasteleria',
  personal_snack: 'personal_snack',
  personal_buffet: 'personal_buffet',
  steward: 'steward',
} as const;
```

- [ ] **Step 4: Completar `role-home.ts`**

En `ROLE_HOME` agregar (después de `personal_pasteleria`):

```typescript
  personal_snack: '/snack',
  personal_buffet: '/buffet',
```

En `ROLE_ALLOWED_PREFIXES` agregar:

```typescript
  personal_snack: ['/snack'],
  personal_buffet: ['/buffet'],
```

Y en la lista de `admin` agregar `'/snack', '/buffet'` (el admin audita todo):

```typescript
  admin: [
    '/inventario',
    '/almacen',
    '/recetas',
    '/produccion',
    '/pasteleria',
    '/pedidos',
    '/snack',
    '/buffet',
    '/cocina-fria',
    '/cocina-caliente',
    '/cocina-amex',
    '/analytics',
    '/admin',
  ],
```

- [ ] **Step 5: Completar `permissions.ts`**

Agregar `'personal_snack', 'personal_buffet'` a estas claves (y solo a estas):

- `'recipes:read'` (catálogo de elaboraciones)
- `'production:read'` (disponibilidad de tandas)
- `'orders:read'`, `'orders:create'`, `'orders:deliver'`, `'orders:cancel'`
- `'turnos:read'`, `'turnos:write'` (TurnoGuard exige abrir turno)

Ejemplo del cambio en `orders:create`:

```typescript
  'orders:create': ['admin', 'mesero_amex', 'personal_snack', 'personal_buffet'],
```

- [ ] **Step 6: Verificar que los tests pasan y el typecheck queda verde**

```bash
pnpm --filter apps/web test -- role-home
pnpm --filter apps/web tsc --noEmit
```

Expected: PASS · sin errores de tipos. Si `tsc` falla en `sidebar.tsx` u otro `Record<UserRole,…>`, completar esas entradas ahí mismo (los `NAV_ITEMS` del sidebar son array — no rompen; la UI de nav se toca en Task 9).

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/enums.ts apps/web/src/lib/auth/
git commit -m "feat(auth): roles personal_snack y personal_buffet — home, prefijos y permisos"
```

---

### Task 2: Canales Socket.io por zona + emisión por zona en orders

**Files:**

- Modify: `packages/shared-types/src/socket-events.ts:7-51`
- Modify: `apps/web/src/modules/orders/actions.ts` (recibirEnCocina:265-266, entregarPedido:393-404, ejecutarTransicionItem:581-593)
- Test: `apps/web/src/modules/orders/tests/actions-item-transitions.test.ts` (agregar caso)

- [ ] **Step 1: Test que falla — despachado de zona snack emite a `sala:snack`**

Agregar a `actions-item-transitions.test.ts` (usa los mocks `vi.hoisted` ya definidos en ese archivo):

```typescript
it('pedido de zona snack despachado emite PEDIDO_ESTADO al canal sala:snack', async () => {
  mocks.findItemForTransition.mockResolvedValue({
    itemId: 'i9',
    pedidoId: 'p9',
    area: 'cocina_caliente',
    estado: 'en_preparacion',
    pedidoEstado: 'en_preparacion',
    pedidoVersion: 2,
    zona: 'snack',
  });
  mocks.transitionItem.mockResolvedValue({ pedidoEstado: 'despachado', pedidoVersion: 3 });
  mocks.assertCan.mockResolvedValue({ ...CTX, role: 'chef_cocina_caliente' });

  const result = await marcarItemListo('i9', 2);

  expect(result.ok).toBe(true);
  const canales = mocks.emitEvent.mock.calls.map((c) => (c as unknown[])[1]);
  expect(canales).toContain('sala:snack');
  expect(canales).not.toContain('sala:amex');
});
```

Nota: importar `marcarItemListo` junto a los imports existentes de `@/modules/orders/actions`.

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm --filter apps/web test -- actions-item-transitions
```

Expected: FAIL — `canales` contiene `'sala:amex'` (hardcodeado hoy).

- [ ] **Step 3: Agregar canales y mapa zona→canal en `socket-events.ts`**

En `CHANNELS` (después de `AMEX`):

```typescript
  SNACK: 'sala:snack',
  BUFFET: 'sala:buffet',
```

En `CHANNEL_ACL` (después de la entrada `'sala:amex'`):

```typescript
  'sala:snack': ['personal_snack', 'admin', 'superuser'],
  'sala:buffet': ['personal_buffet', 'admin', 'superuser'],
```

Después del bloque `CHANNEL_ACL`, agregar el mapa autoritativo zona→canal:

```typescript
// Canal de notificación de cada zona de servicio. Las zonas no se hablan
// entre sí — cada una recibe solo los eventos de sus propios pedidos.
export const ZONA_CHANNEL: Record<ZonaServicio, Channel> = {
  amex: CHANNELS.AMEX,
  snack: CHANNELS.SNACK,
  buffet: CHANNELS.BUFFET,
};
```

(`ZonaServicio` ya está importado en la línea 1 del archivo.)

- [ ] **Step 4: Emitir por zona en `orders/actions.ts`**

Import: agregar `ZONA_CHANNEL` al import existente de `@dorado/shared-types`:

```typescript
import { CHANNELS, ITEM_TRANSITIONS, ZONA_CHANNEL } from '@dorado/shared-types';
```

En `recibirEnCocina` reemplazar:

```typescript
await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, eventoPayload);
await emitEvent(ctx.tenantId, CHANNELS.AMEX, eventoPayload);
```

por:

```typescript
if (pedido.zona === 'amex') {
  await emitEvent(ctx.tenantId, CHANNELS.COCINA_AMEX, eventoPayload);
}
await emitEvent(ctx.tenantId, ZONA_CHANNEL[pedido.zona], eventoPayload);
```

En `ejecutarTransicionItem`, reemplazar el bloque del `despachado`:

```typescript
    if (result.pedidoEstado === 'despachado') {
      await emitEvent(ctx.tenantId, CHANNELS.AMEX, {
```

por:

```typescript
    if (result.pedidoEstado === 'despachado') {
      await emitEvent(ctx.tenantId, ZONA_CHANNEL[item.zona as ZonaServicio], {
```

En `entregarPedido`, después del `emitEvent(ctx.tenantId, CHANNELS.COCINA, …)` existente, agregar la notificación a la zona (otros dispositivos de la misma zona):

```typescript
await emitEvent(ctx.tenantId, ZONA_CHANNEL[pedido.zona], {
  type: 'PEDIDO_ESTADO',
  payload: {
    pedidoId,
    tenantId: ctx.tenantId,
    estadoAnterior: pedido.estado,
    estadoNuevo: 'entregado',
    zona: pedido.zona,
    updatedAt:
      updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
  },
});
```

- [ ] **Step 5: Verificar — tests + typecheck + suite completa de orders**

```bash
pnpm --filter apps/web test -- actions-item-transitions
pnpm --filter apps/web test -- modules/orders
pnpm --filter apps/web tsc --noEmit
```

Expected: PASS todos (la suite existente de orders debe seguir verde — riesgo de regresión declarado en la spec).

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/socket-events.ts apps/web/src/modules/orders/
git commit -m "feat(socket): canales sala:snack y sala:buffet + emisión PEDIDO_ESTADO por zona"
```

---

### Task 3: Migración SQL — RLS extendida + vínculo tanda↔pedido_item

**Files:**

- Create: `supabase/migrations/20260611100000_snack_buffet_rls_tanda_link.sql`

> Si ejecutas con la skill `dorado-new-migration` disponible, úsala para generar el esqueleto; el contenido final debe ser el de abajo. La migración NO se aplica localmente — va por CI (`supabase db push`). **Nunca `supabase start` ni Docker local.**

- [ ] **Step 1: Crear la migración**

```sql
-- 20260611100000_snack_buffet_rls_tanda_link
-- Frente 1 (Snack & Buffet) — spec docs/superpowers/specs/2026-06-11-cierre-operacional-design.md
--
-- 1. Extiende las políticas de modificación de pedidos/pedido_items a los roles
--    de zona (personal_snack, personal_buffet) y corrige el hueco latente de los
--    roles de área (chef_cocina_fria, chef_cocina_caliente, personal_pasteleria)
--    que operan ítems vía cliente de usuario (fn_crear_pedido es SECURITY INVOKER).
-- 2. tandas_produccion.pedido_item_id: trazabilidad de la tanda producida para
--    un ítem de pedido de elaboración (snack/buffet). Nullable: las tandas de
--    producción interna no nacen de un pedido.
--
-- Idempotente. Sin DROP de columnas ni tablas.

DROP POLICY IF EXISTS "pedidos_modify_mesero" ON public.pedidos;
CREATE POLICY "pedidos_modify_mesero" ON public.pedidos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'mesero_amex', 'personal_pasteleria',
      'personal_snack', 'personal_buffet'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "pedido_items_modify_mesero" ON public.pedido_items;
CREATE POLICY "pedido_items_modify_mesero" ON public.pedido_items
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
      'sous_chef', 'mesero_amex', 'personal_pasteleria',
      'personal_snack', 'personal_buffet'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

ALTER TABLE public.tandas_produccion
  ADD COLUMN IF NOT EXISTS pedido_item_id uuid REFERENCES public.pedido_items(id);

COMMENT ON COLUMN public.tandas_produccion.pedido_item_id IS
  'Ítem de pedido (elaboración snack/buffet) que originó esta tanda. NULL para producción interna sin pedido.';

CREATE INDEX IF NOT EXISTS idx_tandas_pedido_item
  ON public.tandas_produccion(tenant_id, pedido_item_id)
  WHERE pedido_item_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260611100000_snack_buffet_rls_tanda_link.sql
git commit -m "feat(db): RLS pedidos para roles de zona/área + tandas_produccion.pedido_item_id"
```

---

### Task 4: Anti-doble-descuento — entrega de elaboración NO descuenta (Principio Rector)

**Files:**

- Modify: `apps/web/src/modules/orders/application/calcular-descuentos.ts`
- Modify: `apps/web/src/modules/orders/domain/pedido.ts:60-67`
- Modify: `apps/web/src/modules/orders/infrastructure/order-repository.ts` (`findByIdForDelivery` select + `toPedidoForDelivery` + tipo `PedidoWithIngsRow`)
- Test: `apps/web/src/modules/orders/tests/calcular-descuentos.test.ts` (agregar casos)
- Test: `apps/web/src/modules/orders/tests/actions-entregar-pedido.test.ts` (agregar caso)

- [ ] **Step 1: Tests que fallan en `calcular-descuentos.test.ts`**

Agregar (ajustar los items existentes del archivo agregando `recetaTipo: 'servicio'` donde el compilador lo exija):

```typescript
it('excluye ítems de recetas tipo produccion — el FEFO ya corrió en fn_completar_tanda', () => {
  const descuentos = calcularDescuentosPedido('p1', [
    {
      id: 'i1',
      cantidad: 2,
      recetaPorciones: 1,
      recetaTipo: 'produccion',
      ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Arroz', cantidadPorBatch: 5000 }],
    },
    {
      id: 'i2',
      cantidad: 1,
      recetaPorciones: 4,
      recetaTipo: 'servicio',
      ingredientes: [{ insumoId: 'ins2', insumoNombre: 'Pollo', cantidadPorBatch: 800 }],
    },
  ]);

  expect(descuentos).toHaveLength(1);
  expect(descuentos[0]?.insumoId).toBe('ins2');
  expect(descuentos[0]?.cantidad).toBe(200);
});

it('pedido compuesto solo por elaboraciones produce cero descuentos', () => {
  const descuentos = calcularDescuentosPedido('p2', [
    {
      id: 'i1',
      cantidad: 3,
      recetaPorciones: 1,
      recetaTipo: 'produccion',
      ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Arroz', cantidadPorBatch: 5000 }],
    },
  ]);
  expect(descuentos).toHaveLength(0);
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm --filter apps/web test -- calcular-descuentos
```

Expected: FAIL — `recetaTipo` no existe en `ItemEntrega` (error de tipos) y/o devuelve 2 descuentos.

- [ ] **Step 3: Implementar en `calcular-descuentos.ts`**

```typescript
// Modelo F3: merma aplicada en recepción (stock neto); consumo descuenta cantidades netas directas.
export interface DescuentoInsumo {
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  idempotencyKey: string;
}

interface ItemEntrega {
  id: string;
  cantidad: number;
  recetaPorciones: number;
  // Tipo de la receta del ítem. Las elaboraciones (produccion) ya descontaron
  // su FEFO al completar la tanda (fn_completar_tanda) — la entrega solo
  // registra trazabilidad. Descontar aquí sería doble descuento.
  recetaTipo: 'produccion' | 'servicio';
  ingredientes: { insumoId: string; insumoNombre: string; cantidadPorBatch: number }[];
}

export function calcularDescuentosPedido(
  pedidoId: string,
  items: ItemEntrega[],
): DescuentoInsumo[] {
  return items
    .filter((item) => item.recetaTipo !== 'produccion')
    .flatMap((item) =>
      item.ingredientes.map((ing) => ({
        insumoId: ing.insumoId,
        insumoNombre: ing.insumoNombre,
        cantidad: (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad,
        idempotencyKey: `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`,
      })),
    );
}
```

- [ ] **Step 4: Propagar el tipo en domain e infrastructure**

En `domain/pedido.ts`, importar `TipoReceta` y agregar el campo:

```typescript
import type {
  EstadoPedido,
  ZonaServicio,
  AreaProduccion,
  EstadoItem,
  TipoReceta,
} from '@dorado/shared-types';
```

```typescript
export interface PedidoItemConIngredientes extends PedidoItem {
  recetaPorciones: number;
  recetaTipo: TipoReceta;
  ingredientes: PedidoItemIngrediente[];
}
```

En `order-repository.ts`:

1. En el select de `findByIdForDelivery`, cambiar `receta:recetas(` para incluir el tipo:

```typescript
            receta:recetas(
              nombre, porciones, tipo_receta,
              receta_ingredientes(insumo_id, cantidad, merma_coeficiente, insumo:insumos(nombre))
            )
```

2. En el tipo `PedidoWithIngsRow`, agregar `tipo_receta: string;` dentro del objeto `receta`.

3. En `toPedidoForDelivery`, agregar al map del ítem:

```typescript
    recetaTipo: (i.receta?.tipo_receta ?? 'servicio') as TipoReceta,
```

(importar `TipoReceta` de `@dorado/shared-types` en el repository si no está).

- [ ] **Step 5: Test de integración en `actions-entregar-pedido.test.ts`**

Agregar caso (seguir los mocks existentes del archivo — `findByIdForDelivery`, `transition`, `rpc`):

```typescript
it('entregar pedido de solo elaboraciones NO invoca fn_descontar_insumo_fefo', async () => {
  mocks.findByIdForDelivery.mockResolvedValue({
    id: 'p1',
    tenantId: 't1',
    numeroMesa: null,
    zona: 'buffet',
    estado: 'despachado',
    version: 4,
    notas: null,
    cocineroId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'i1',
        pedidoId: 'p1',
        recetaId: 'r1',
        recetaNombre: 'Arroz blanco',
        cantidad: 2,
        notas: null,
        areaProduccion: 'cocina_caliente',
        estado: 'listo',
        enPreparacionAt: null,
        listoAt: null,
        iniciadoPor: null,
        listoPor: null,
        recetaPorciones: 1,
        recetaTipo: 'produccion',
        ingredientes: [
          { insumoId: 'ins1', insumoNombre: 'Arroz', cantidadPorBatch: 5000, mermaCoeficiente: 0 },
        ],
      },
    ],
  });
  mocks.transition.mockResolvedValue({
    id: 'p1',
    estado: 'entregado',
    version: 5,
    updatedAt: new Date(),
  });

  const result = await entregarPedido('p1', 4);

  expect(result.ok).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.transition).toHaveBeenCalledWith('p1', 't1', 'entregado', 4);
});
```

- [ ] **Step 6: Verificar todo verde**

```bash
pnpm --filter apps/web test -- modules/orders
pnpm --filter apps/web tsc --noEmit
```

Expected: PASS. Si otros tests de `entregar-pedido` fallan por el campo nuevo, agregar `recetaTipo: 'servicio'` a sus fixtures (comportamiento previo intacto para platos).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/modules/orders/
git commit -m "feat(orders): entrega de ítems tipo produccion no descuenta FEFO — anti doble descuento"
```

---

### Task 5: Catálogo de elaboraciones por zona

**Files:**

- Modify: `apps/web/src/modules/orders/actions.ts` (nueva action junto a `getCartaServicio`)
- Test: `apps/web/src/modules/orders/tests/actions-carta-elaboraciones.test.ts` (nuevo)

- [ ] **Step 1: Test que falla (archivo nuevo)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const order = vi.fn();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    order,
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return {
    assertCan: vi.fn(),
    auditLog: vi.fn(async () => {}),
    emitEvent: vi.fn(async () => {}),
    chain,
    order,
    from: vi.fn(() => chain),
  };
});

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({}),
}));

import { getCartaElaboraciones } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'personal_buffet' };

describe('getCartaElaboraciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('devuelve recetas tipo produccion de las áreas permitidas para la zona', async () => {
    mocks.order.mockResolvedValue({
      data: [
        { id: 'r1', nombre: 'Arroz blanco', area_produccion: 'cocina_caliente', porciones: 1 },
      ],
      error: null,
    });

    const result = await getCartaElaboraciones('buffet');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { id: 'r1', nombre: 'Arroz blanco', area: 'cocina_caliente', porciones: 1 },
      ]);
    }
    expect(mocks.assertCan).toHaveBeenCalledWith('recipes:read');
    expect(mocks.chain.eq).toHaveBeenCalledWith('tipo_receta', 'produccion');
    expect(mocks.chain.in).toHaveBeenCalledWith('area_produccion', [
      'cocina_caliente',
      'cocina_fria',
      'pasteleria',
    ]);
  });

  it('rechaza una zona inválida', async () => {
    const result = await getCartaElaboraciones('plaza' as never);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm --filter apps/web test -- actions-carta-elaboraciones
```

Expected: FAIL — `getCartaElaboraciones` no existe.

- [ ] **Step 3: Implementar la action en `orders/actions.ts`**

Agregar `ZONA_AREAS_PERMITIDAS` al import de shared-types y, debajo de `getCartaServicio`:

```typescript
// ── Catálogo de elaboraciones (snack/buffet) ─────────────────────────────────
// Las zonas de origen piden ELABORACIONES (recetas tipo produccion con
// cantidades estandarizadas por tanda), no platos de carta.

export interface CartaElaboracion {
  id: string;
  nombre: string;
  area: AreaProduccion;
  porciones: number;
}

export async function getCartaElaboraciones(
  zona: ZonaServicio,
): Promise<Result<CartaElaboracion[]>> {
  try {
    const ctx = await assertCan('recipes:read');
    const areasPermitidas = ZONA_AREAS_PERMITIDAS[zona];
    if (!areasPermitidas) {
      return err(new AppError('VALIDATION', 400, `Zona desconocida: ${zona}`));
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('recetas')
      .select('id, nombre, area_produccion, porciones')
      .eq('tenant_id', ctx.tenantId)
      .eq('tipo_receta', 'produccion')
      .eq('activo', true)
      .in('area_produccion', areasPermitidas)
      .is('deleted_at', null)
      .order('nombre');

    if (error) throw new AppError('DB_ERROR', 500, error.message);

    return ok(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r['id'] as string,
        nombre: r['nombre'] as string,
        area: r['area_produccion'] as AreaProduccion,
        porciones: (r['porciones'] as number) ?? 1,
      })),
    );
  } catch (e) {
    return err(toAppError(e));
  }
}
```

- [ ] **Step 4: Verificar**

```bash
pnpm --filter apps/web test -- actions-carta-elaboraciones
pnpm --filter apps/web tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/orders/
git commit -m "feat(orders): getCartaElaboraciones — catálogo tipo produccion filtrado por zona"
```

---

### Task 6: Producción — tanda vinculada a pedido_item + disponibilidad por zona

**Files:**

- Modify: `packages/shared-validation/src/index.ts:185-192` (createTandaSchema)
- Modify: `apps/web/src/modules/production/domain/tanda.ts`
- Modify: `apps/web/src/modules/production/application/ports/production-repository.port.ts`
- Create: `apps/web/src/modules/production/application/get-tandas-disponibles.ts`
- Modify: `apps/web/src/modules/production/infrastructure/production-repository.ts`
- Modify: `apps/web/src/modules/production/actions.ts`
- Test: `apps/web/src/modules/production/tests/tanda-application.test.ts` (agregar casos)

- [ ] **Step 1: Test que falla — use case de disponibilidad**

En `tanda-application.test.ts`, siguiendo el patrón de mocks del archivo (repo mockeado):

```typescript
import { getTandasDisponibles } from '@/modules/production/application/get-tandas-disponibles';

describe('getTandasDisponibles', () => {
  it('delega en findCompletadasByZona con la zona pedida', async () => {
    const tandas = [{ id: 't1' }] as never[];
    const repo = {
      findCompletadasByZona: vi.fn().mockResolvedValue(tandas),
    };
    const result = await getTandasDisponibles(repo as never, 'tenant1', 'snack');
    expect(result).toBe(tandas);
    expect(repo.findCompletadasByZona).toHaveBeenCalledWith('tenant1', 'snack', 24);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm --filter apps/web test -- tanda-application
```

Expected: FAIL — módulo `get-tandas-disponibles` no existe.

- [ ] **Step 3: Implementar use case + port**

`application/get-tandas-disponibles.ts` (nuevo):

```typescript
import type { ProductionRepository } from './ports/production-repository.port';
import type { Tanda, ZonaServicio } from '../domain/tanda';

// Disponibilidad para zonas de origen: tandas completadas en las últimas 24h
// con destino a la zona. La zona consulta qué hay producido antes de pedir.
const VENTANA_HORAS = 24;

export async function getTandasDisponibles(
  repo: ProductionRepository,
  tenantId: string,
  zona: ZonaServicio,
): Promise<Tanda[]> {
  return repo.findCompletadasByZona(tenantId, zona, VENTANA_HORAS);
}
```

En el port `production-repository.port.ts` agregar al interface:

```typescript
  /** Tandas completadas con destino a la zona en la ventana de horas dada. */
  findCompletadasByZona(tenantId: string, zona: string, horasVentana: number): Promise<Tanda[]>;
```

- [ ] **Step 4: Implementar en `production-repository.ts`** (después de `findAll`):

```typescript
    async findCompletadasByZona(
      tenantId: string,
      zona: string,
      horasVentana: number,
    ): Promise<Tanda[]> {
      const supabase = await createClient();
      const desde = new Date(Date.now() - horasVentana * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('tandas_produccion')
        .select(TANDA_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('zona_destino', zona)
        .eq('estado', 'completada')
        .gte('completed_at', desde)
        .order('completed_at', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as TandaRow[]).map(toTanda);
    },
```

- [ ] **Step 5: pedidoItemId en el flujo de creación de tanda**

1. `packages/shared-validation/src/index.ts` — agregar al `createTandaSchema`:

```typescript
export const createTandaSchema = z.object({
  recetaId: uuidSchema,
  turnoId: uuidSchema.optional(),
  cantidadTandas: z.number().int().positive('La cantidad de tandas debe ser mayor que 0'),
  zonaDestino: zonaServicioSchema,
  pedidoItemId: uuidSchema.optional(),
  notas: z.string().max(500).optional(),
  idempotencyKey: idempotencyKeySchema,
});
```

2. `domain/tanda.ts` — en `CreateTandaInput` agregar `pedidoItemId?: string | null;` y en `Tanda` agregar `pedidoItemId: string | null;`.

3. `production-repository.ts` — en `TANDA_COLUMNS` agregar `pedido_item_id` a la lista plana; en `TandaRow` agregar `pedido_item_id: string | null;`; en `toTanda` mapear `pedidoItemId: row.pedido_item_id ?? null,`; en `create` agregar al insert:

```typescript
          pedido_item_id: input.pedidoItemId ?? null,
```

4. `actions.ts` `createTanda` — pasar el campo al use case:

```typescript
      pedidoItemId: parsed.data.pedidoItemId ?? null,
```

- [ ] **Step 6: Action de disponibilidad en `production/actions.ts`**

```typescript
export async function getTandasDisponiblesZona(zona: ZonaServicio): Promise<Result<Tanda[]>> {
  try {
    const ctx = await assertCan('production:read');
    const repo = createProductionRepository();
    return ok(await getTandasDisponibles(repo, ctx.tenantId, zona));
  } catch (e) {
    return err(toAppError(e));
  }
}
```

(con `import { getTandasDisponibles } from './application/get-tandas-disponibles';` y `ZonaServicio` en los imports de tipos).

- [ ] **Step 7: Verificar**

```bash
pnpm --filter apps/web test -- modules/production
pnpm --filter apps/web tsc --noEmit
pnpm --filter packages/shared-validation test 2>/dev/null || pnpm test --filter @dorado/shared-validation 2>/dev/null || true
```

Expected: PASS (production y typecheck verdes; el tercer comando es tolerante porque shared-validation puede no tener suite propia).

- [ ] **Step 8: Commit**

```bash
git add packages/shared-validation/ apps/web/src/modules/production/
git commit -m "feat(production): tanda vinculada a pedido_item + tandas disponibles por zona"
```

---

### Task 7: Pedidos del turno activo por zona (historial + métricas)

**Files:**

- Modify: `apps/web/src/modules/orders/application/ports/order-repository.port.ts`
- Modify: `apps/web/src/modules/orders/infrastructure/order-repository.ts`
- Modify: `apps/web/src/modules/orders/actions.ts`
- Test: `apps/web/src/modules/orders/tests/actions-pedidos-zona.test.ts` (nuevo)

- [ ] **Step 1: Test que falla (archivo nuevo)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  findActiveByZona: vi.fn(),
  findByTurnoZona: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ maybeSingle: mocks.maybeSingle }) }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findActiveByZona: mocks.findActiveByZona,
    findByTurnoZona: mocks.findByTurnoZona,
  }),
}));

import { getPedidosZona, getPedidosTurnoZona } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'personal_snack' };

describe('pedidos por zona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('getPedidosZona delega en findActiveByZona', async () => {
    mocks.findActiveByZona.mockResolvedValue([]);
    const result = await getPedidosZona('snack');
    expect(result.ok).toBe(true);
    expect(mocks.findActiveByZona).toHaveBeenCalledWith('t1', 'snack');
  });

  it('getPedidosTurnoZona resuelve el turno activo y filtra por él', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'turno-9' } });
    mocks.findByTurnoZona.mockResolvedValue([]);
    const result = await getPedidosTurnoZona('buffet');
    expect(result.ok).toBe(true);
    expect(mocks.findByTurnoZona).toHaveBeenCalledWith('t1', 'turno-9', 'buffet');
  });

  it('getPedidosTurnoZona sin turno activo devuelve lista vacía', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const result = await getPedidosTurnoZona('buffet');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
    expect(mocks.findByTurnoZona).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

```bash
pnpm --filter apps/web test -- actions-pedidos-zona
```

Expected: FAIL — actions no existen.

- [ ] **Step 3: Port + repositorio**

En `order-repository.port.ts` agregar al interface:

```typescript
  /** Pedidos del turno dado para una zona (historial y métricas del turno). */
  findByTurnoZona(tenantId: string, turnoId: string, zona: string): Promise<PedidoWithItems[]>;
```

En `order-repository.ts`, después de `findActiveByZona` (mismo patrón, sin filtro de estado — el historial incluye entregados/cancelados):

```typescript
    async findByTurnoZona(
      tenantId: string,
      turnoId: string,
      zona: string,
    ): Promise<PedidoWithItems[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('pedidos')
        .select(PEDIDO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .eq('zona', zona)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as PedidoRow[]).map(toPedidoWithItems);
    },
```

- [ ] **Step 4: Actions en `orders/actions.ts`**

```typescript
// ── Vista de zona (snack/buffet) ──────────────────────────────────────────────

export async function getPedidosZona(zona: ZonaServicio): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const repo = createOrderRepository();
    return ok(await repo.findActiveByZona(ctx.tenantId, zona));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getPedidosTurnoZona(zona: ZonaServicio): Promise<Result<PedidoWithItems[]>> {
  try {
    const ctx = await assertCan('orders:read');
    const supabase = await createClient();
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('activo', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (!turno) return ok([]);

    const repo = createOrderRepository();
    return ok(await repo.findByTurnoZona(ctx.tenantId, turno.id, zona));
  } catch (e) {
    return err(toAppError(e));
  }
}
```

- [ ] **Step 5: Verificar**

```bash
pnpm --filter apps/web test -- modules/orders
pnpm --filter apps/web tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/orders/
git commit -m "feat(orders): pedidos activos y del turno por zona — base de la vista snack/buffet"
```

---

### Task 8: UI — diálogo de pedido de zona + vista de zona compartida

**Files:**

- Create: `apps/web/src/components/zonas/create-pedido-zona-dialog.tsx`
- Create: `apps/web/src/components/zonas/zona-view.tsx`
- Modify: `apps/web/src/messages/es.json` (sección nueva `zonaView`)
- Modify: `apps/web/src/messages/en.json` (espejo)

> UI sin tests unitarios de componente (el proyecto no testea componentes con Vitest hoy); la cobertura va por E2E (Task 10) y por las actions ya testeadas.

- [ ] **Step 1: i18n — agregar a `es.json` (top-level, junto a `"pedidos"`)**

```json
"zonaView": {
  "metaTitleSnack": "Snack — Dorado Lounge",
  "metaTitleBuffet": "Buffet — Dorado Lounge",
  "tituloSnack": "Barra Snack",
  "tituloBuffet": "Buffet",
  "subtitulo": "Pedidos de elaboraciones a cocina",
  "tabPedir": "Pedir",
  "tabPedidos": "Pedidos activos",
  "tabDisponibilidad": "Disponibilidad",
  "tabTurno": "Mi turno",
  "nuevoPedido": "Nuevo pedido",
  "sinElaboraciones": "No hay elaboraciones disponibles para esta zona",
  "sinPedidos": "Sin pedidos activos",
  "sinTandas": "Sin producción disponible en las últimas 24 h",
  "sinHistorial": "Sin pedidos en el turno activo",
  "colElaboracion": "Elaboración",
  "colArea": "Área",
  "colTandas": "Tandas",
  "colEstado": "Estado",
  "colHace": "Hace",
  "colCompletada": "Completada",
  "confirmarEntrega": "Confirmar recibido",
  "cancelar": "Cancelar pedido",
  "metricaPedidosTurno": "Pedidos del turno",
  "metricaEntregados": "Entregados",
  "metricaTiempoPromedio": "Tiempo promedio de entrega",
  "minutos": "{n} min",
  "create": {
    "title": "Pedir elaboraciones",
    "srDescription": "Solicita elaboraciones estandarizadas a las cocinas de tu zona.",
    "items": "Elaboraciones",
    "recetaPlaceholder": "Seleccionar elaboración",
    "cantidadTandas": "Tandas",
    "agregarItem": "Agregar elaboración",
    "notas": "Notas",
    "notasPlaceholder": "Indicaciones para cocina…",
    "optional": "(opcional)",
    "guardar": "Enviar pedido",
    "guardando": "Enviando…",
    "cancelar": "Cancelar"
  }
}
```

Agregar el espejo en inglés en `en.json` (mismas claves, valores en inglés: "Snack Bar", "Buffet", "Order prepared items to the kitchen", "Order", "Active orders", "Availability", "My shift", "New order", etc.).

- [ ] **Step 2: Crear `create-pedido-zona-dialog.tsx`**

Adaptación de `components/orders/create-pedido-dialog.tsx` — zona fija (sin selector), catálogo de elaboraciones, cantidad = tandas:

```typescript
'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createPedidoSchema } from '@dorado/shared-validation';
import { createPedido } from '@/modules/orders/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CartaElaboracion } from '@/modules/orders/actions';
import type { ZonaServicio } from '@/modules/orders/domain/pedido';
import type { z } from 'zod';

type FormInput = z.input<typeof createPedidoSchema>;
type FormOutput = z.output<typeof createPedidoSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  zona: ZonaServicio;
  elaboraciones: CartaElaboracion[];
}

const genKey = () => `zon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function CreatePedidoZonaDialog({ open, onOpenChange, onCreated, zona, elaboraciones }: Props) {
  const t = useTranslations('zonaView.create');
  const [serverError, setServerError] = useState('');
  const idempotencyKeyRef = useRef(genKey());

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createPedidoSchema),
    defaultValues: {
      zona,
      idempotencyKey: idempotencyKeyRef.current,
      items: [{ recetaId: '', cantidad: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (values: FormOutput) => {
    setServerError('');
    const result = await createPedido(values);
    if (!result.ok) {
      setServerError(result.error.message);
      return;
    }
    idempotencyKeyRef.current = genKey();
    reset({ zona, idempotencyKey: idempotencyKeyRef.current, items: [{ recetaId: '', cantidad: 1 }] });
    onCreated();
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset({ zona, idempotencyKey: idempotencyKeyRef.current, items: [{ recetaId: '', cantidad: 1 }] });
      setServerError('');
    }
    onOpenChange(isOpen);
  };

  const itemErrors = (errors.items ?? []) as Array<
    { recetaId?: { message?: string }; cantidad?: { message?: string } } | undefined
  >;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('srDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label>{t('items')} *</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <Select
                    onValueChange={(v) =>
                      setValue(`items.${index}.recetaId`, v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t('recetaPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {elaboraciones.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {itemErrors[index]?.recetaId && (
                    <p className="text-xs text-destructive">{itemErrors[index]?.recetaId?.message}</p>
                  )}
                </div>
                <div className="w-20 space-y-1">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    aria-label={t('cantidadTandas')}
                    className="h-9"
                    {...register(`items.${index}.cantidad`, { valueAsNumber: true })}
                  />
                  {itemErrors[index]?.cantidad && (
                    <p className="text-xs text-destructive">{itemErrors[index]?.cantidad?.message}</p>
                  )}
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => append({ recetaId: '', cantidad: 1 })}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t('agregarItem')}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">
              {t('notas')} <span className="text-muted-foreground font-normal">{t('optional')}</span>
            </Label>
            <textarea
              id="notas"
              rows={2}
              placeholder={t('notasPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              {...register('notas')}
            />
          </div>

          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={isSubmitting}>
              {t('cancelar')}
            </Button>
            <Button type="submit" disabled={isSubmitting || elaboraciones.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('guardando')}
                </>
              ) : (
                t('guardar')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Crear `zona-view.tsx`**

Patrón realtime de `kds-board-area.tsx` (join/leave de canal + refresh). Tabs: Pedir · Pedidos activos · Disponibilidad · Mi turno (historial + métricas):

```typescript
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingBasket, ClipboardList, PackageCheck, History } from 'lucide-react';
import { ZONA_CHANNEL } from '@dorado/shared-types';
import { useSocket } from '@/lib/socket/use-socket';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CreatePedidoZonaDialog } from './create-pedido-zona-dialog';
import {
  getPedidosZona,
  getPedidosTurnoZona,
  entregarPedido,
  cancelarPedido,
} from '@/modules/orders/actions';
import { getTandasDisponiblesZona } from '@/modules/production/actions';
import type { CartaElaboracion } from '@/modules/orders/actions';
import type { PedidoWithItems, ZonaServicio } from '@/modules/orders/domain/pedido';
import type { Tanda } from '@/modules/production/domain/tanda';
import type { SocketEvent } from '@dorado/shared-types';

type Tab = 'pedir' | 'pedidos' | 'disponibilidad' | 'turno';

interface Props {
  zona: ZonaServicio;
  titulo: string;
  elaboraciones: CartaElaboracion[];
  initialPedidos: PedidoWithItems[];
  initialTandas: Tanda[];
  initialTurnoPedidos: PedidoWithItems[];
}

export function ZonaView({
  zona,
  titulo,
  elaboraciones,
  initialPedidos,
  initialTandas,
  initialTurnoPedidos,
}: Props) {
  const t = useTranslations('zonaView');
  const [tab, setTab] = useState<Tab>('pedidos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoWithItems[]>(initialPedidos);
  const [tandas, setTandas] = useState<Tanda[]>(initialTandas);
  const [turnoPedidos, setTurnoPedidos] = useState<PedidoWithItems[]>(initialTurnoPedidos);
  const socket = useSocket();

  const refresh = useCallback(async () => {
    const [p, td, tp] = await Promise.all([
      getPedidosZona(zona),
      getTandasDisponiblesZona(zona),
      getPedidosTurnoZona(zona),
    ]);
    if (p.ok) setPedidos(p.value);
    if (td.ok) setTandas(td.value);
    if (tp.ok) setTurnoPedidos(tp.value);
  }, [zona]);

  const channel = ZONA_CHANNEL[zona];

  useEffect(() => {
    if (!socket) return;
    socket.emit('join', channel);

    const handleEvent = (event: SocketEvent) => {
      if (event.type === 'PEDIDO_ESTADO' || event.type === 'PEDIDO_CREADO') {
        refresh();
      }
    };

    socket.on('event', handleEvent);
    socket.on('connect', refresh);
    return () => {
      socket.off('event', handleEvent);
      socket.off('connect', refresh);
      socket.emit('leave', channel);
    };
  }, [socket, refresh, channel]);

  const metricas = useMemo(() => {
    const entregados = turnoPedidos.filter((p) => p.estado === 'entregado');
    const tiempos = entregados
      .map((p) =>
        p.timestamps.entregadoAt
          ? (p.timestamps.entregadoAt.getTime() - p.createdAt.getTime()) / 60000
          : null,
      )
      .filter((m): m is number => m !== null);
    const promedio =
      tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0;
    return { total: turnoPedidos.length, entregados: entregados.length, promedio };
  }, [turnoPedidos]);

  const tabs: { key: Tab; label: string; icon: typeof ShoppingBasket }[] = [
    { key: 'pedir', label: t('tabPedir'), icon: ShoppingBasket },
    { key: 'pedidos', label: t('tabPedidos'), icon: ClipboardList },
    { key: 'disponibilidad', label: t('tabDisponibilidad'), icon: PackageCheck },
    { key: 'turno', label: t('tabTurno'), icon: History },
  ];

  const handleEntregar = async (p: PedidoWithItems) => {
    const result = await entregarPedido(p.id, p.version);
    if (result.ok) refresh();
  };

  const handleCancelar = async (p: PedidoWithItems) => {
    const result = await cancelarPedido(p.id, p.version);
    if (result.ok) refresh();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('subtitulo')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>{t('nuevoPedido')}</Button>
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {tabs.map(({ key, label, icon: Icon }, i) => (
          <button
            key={key}
            type="button"
            onClick={() => (key === 'pedir' ? setDialogOpen(true) : setTab(key))}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
              i > 0 && 'border-l border-border',
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && (
        <div className="space-y-2">
          {pedidos.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('sinPedidos')}</p>
          )}
          {pedidos.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {p.items.map((i) => `${i.cantidad}× ${i.recetaNombre}`).join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`estado_${p.estado}` as never) ?? p.estado} ·{' '}
                  {Math.round((Date.now() - p.createdAt.getTime()) / 60000)} min
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {p.estado === 'despachado' && (
                  <Button size="sm" onClick={() => handleEntregar(p)}>
                    {t('confirmarEntrega')}
                  </Button>
                )}
                {p.estado === 'creado' && (
                  <Button size="sm" variant="outline" onClick={() => handleCancelar(p)}>
                    {t('cancelar')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'disponibilidad' && (
        <div className="space-y-2">
          {tandas.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('sinTandas')}</p>
          )}
          {tandas.map((td) => (
            <div key={td.id} className="rounded-lg border border-border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{td.recetaNombre}</p>
                <p className="text-xs text-muted-foreground">
                  {t('colTandas')}: {td.cantidadTandas}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {td.completedAt ? td.completedAt.toLocaleTimeString() : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === 'turno' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">{t('metricaPedidosTurno')}</p>
              <p className="text-2xl font-bold">{metricas.total}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">{t('metricaEntregados')}</p>
              <p className="text-2xl font-bold">{metricas.entregados}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">{t('metricaTiempoPromedio')}</p>
              <p className="text-2xl font-bold">{t('minutos', { n: metricas.promedio })}</p>
            </div>
          </div>
          <div className="space-y-2">
            {turnoPedidos.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">{t('sinHistorial')}</p>
            )}
            {turnoPedidos.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-3 flex items-center justify-between">
                <p className="text-sm truncate">
                  {p.items.map((i) => `${i.cantidad}× ${i.recetaNombre}`).join(' · ')}
                </p>
                <span className="text-xs text-muted-foreground shrink-0 ml-3">{p.estado}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreatePedidoZonaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          setTab('pedidos');
          refresh();
        }}
        zona={zona}
        elaboraciones={elaboraciones}
      />
    </div>
  );
}
```

Nota de implementación: para los labels de estado usar las claves existentes `pedidos.estadoCreado`, `pedidos.estadoDespachado`, etc. — si `t('estado_…')` del snippet no compila con next-intl estricto, reemplazar por un mapa local `const ESTADO_LABEL: Record<EstadoPedido, string>` construido con `useTranslations('pedidos')`.

- [ ] **Step 4: Verificar build de tipos y lint**

```bash
pnpm --filter apps/web tsc --noEmit
pnpm lint
```

Expected: verde. (Los componentes aún no se montan en ninguna página — eso es Task 9.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/zonas/ apps/web/src/messages/
git commit -m "feat(ui): vista de zona snack/buffet — pedir elaboraciones, seguimiento, disponibilidad y turno"
```

---

### Task 9: Páginas `/snack` y `/buffet` + navegación

**Files:**

- Create: `apps/web/src/app/(dashboard)/snack/page.tsx`
- Create: `apps/web/src/app/(dashboard)/buffet/page.tsx`
- Modify: `apps/web/src/components/layout/sidebar.tsx` (NAV_ITEMS)
- Modify: `apps/web/src/messages/es.json` + `en.json` (claves `nav.snack`, `nav.buffet`)

- [ ] **Step 1: Página `/snack`** (patrón de `cocina-caliente/page.tsx` + carga inicial en paralelo):

```typescript
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { assertCan } from '@/lib/auth/assertCan';
import {
  getCartaElaboraciones,
  getPedidosZona,
  getPedidosTurnoZona,
} from '@/modules/orders/actions';
import { getTandasDisponiblesZona } from '@/modules/production/actions';
import { ZonaView } from '@/components/zonas/zona-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('zonaView');
  return { title: t('metaTitleSnack') };
}

export default async function SnackPage() {
  try {
    await assertCan('orders:create');
  } catch {
    redirect('/login');
  }

  const t = await getTranslations('zonaView');
  const [elaboraciones, pedidos, tandas, turnoPedidos] = await Promise.all([
    getCartaElaboraciones('snack'),
    getPedidosZona('snack'),
    getTandasDisponiblesZona('snack'),
    getPedidosTurnoZona('snack'),
  ]);

  return (
    <ZonaView
      zona="snack"
      titulo={t('tituloSnack')}
      elaboraciones={elaboraciones.ok ? elaboraciones.value : []}
      initialPedidos={pedidos.ok ? pedidos.value : []}
      initialTandas={tandas.ok ? tandas.value : []}
      initialTurnoPedidos={turnoPedidos.ok ? turnoPedidos.value : []}
    />
  );
}
```

- [ ] **Step 2: Página `/buffet`** — idéntica cambiando `'snack'` → `'buffet'`, `metaTitleSnack` → `metaTitleBuffet`, `tituloSnack` → `tituloBuffet`, `zona="buffet"`.

- [ ] **Step 3: Sidebar — agregar a `NAV_ITEMS`** (después de la entrada de `/pedidos`):

```typescript
  {
    href: '/snack',
    labelKey: 'snack',
    icon: ClipboardList,
    roles: ['admin', 'personal_snack'],
  },
  {
    href: '/buffet',
    labelKey: 'buffet',
    icon: ClipboardList,
    roles: ['admin', 'personal_buffet'],
  },
```

- [ ] **Step 4: i18n nav** — en `es.json` sección `"nav"` agregar `"snack": "Snack"`, `"buffet": "Buffet"`; espejo en `en.json` (`"snack": "Snack Bar"`, `"buffet": "Buffet"`). Verificar también que la sección `"roles"` tenga labels para `personal_snack`/`personal_buffet` (es: "Personal Snack" / "Personal Buffet"; en: "Snack Staff" / "Buffet Staff") — el sidebar muestra el rol del usuario.

- [ ] **Step 5: Verificar**

```bash
pnpm --filter apps/web tsc --noEmit
pnpm lint
pnpm --filter apps/web test
```

Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/ apps/web/src/components/layout/ apps/web/src/messages/
git commit -m "feat(zonas): rutas /snack y /buffet con navegación por rol"
```

---

### Task 10: Test users canónicos + E2E smoke

**Files:**

- Modify: `scripts/reset-test-users.mjs` (TEST_USERS)
- Create: `apps/web/e2e/zonas.spec.ts`

- [ ] **Step 1: Agregar usuarios canónicos** en `TEST_USERS` (después de `pasteleria@dorado.test`):

```javascript
  {
    email: 'snack@dorado.test',
    nombre: 'Personal Snack',
    role: 'personal_snack',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'buffet@dorado.test',
    nombre: 'Personal Buffet',
    role: 'personal_buffet',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
```

- [ ] **Step 2: E2E smoke `apps/web/e2e/zonas.spec.ts`** (patrón lenient de `pedido-lifecycle.spec.ts`, sesión admin):

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

test.describe('Vistas de zona snack/buffet', () => {
  test('admin puede auditar /snack y ver las pestañas de la zona', async ({ page }) => {
    await page.goto('/snack');
    await expect(page).toHaveURL(/\/snack/);
    await expect(page.getByRole('button', { name: /Pedidos activos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Disponibilidad/i })).toBeVisible();
  });

  test('admin puede auditar /buffet y abrir el diálogo de pedido', async ({ page }) => {
    await page.goto('/buffet');
    await expect(page).toHaveURL(/\/buffet/);

    const nuevoBtn = page.getByRole('button', { name: /Nuevo pedido/i });
    if ((await nuevoBtn.count()) === 0) {
      test.skip(!process.env['E2E_ADMIN_EMAIL'], 'requiere credenciales E2E');
      return;
    }
    await nuevoBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Pedir elaboraciones/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Verificar que el spec compila** (la corrida completa de Playwright requiere entorno con credenciales — en CI):

```bash
pnpm --filter apps/web tsc --noEmit
pnpm --filter apps/web test:e2e -- --list 2>/dev/null || npx --prefix apps/web playwright test --list
```

Expected: `zonas.spec.ts` aparece en el listado de tests.

- [ ] **Step 4: Commit**

```bash
git add scripts/reset-test-users.mjs apps/web/e2e/zonas.spec.ts
git commit -m "test(zonas): usuarios canónicos snack/buffet + e2e smoke de vistas de zona"
```

---

### Task 11: Verificación final + PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: todo verde, cero warnings nuevos. (REQUIRED: skill `superpowers:verification-before-completion` — no declarar éxito sin esta salida.)

- [ ] **Step 2: Revisión de arquitectura del módulo tocado**

Ejecutar la skill `/check-arch` (o el agente `dorado-hex-reviewer` sobre `orders` y `production`) y corregir violaciones si reporta.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/snack-buffet
gh pr create --title "feat(zonas): UIs dedicadas Snack y Buffet — pedidos por elaboración" --body "$(cat <<'EOF'
## Frente 1 del cierre operacional (spec 2026-06-11)

- Roles `personal_snack` / `personal_buffet` (TS + RLS; el enum SQL ya existía)
- Canales `sala:snack` / `sala:buffet` + emisión de eventos por zona (`ZONA_CHANNEL`)
- Pedidos por elaboración: catálogo de recetas tipo `produccion` filtrado por `ZONA_AREAS_PERMITIDAS`
- **Anti-doble-descuento**: la entrega de ítems tipo `produccion` no invoca FEFO (el descuento corre en `fn_completar_tanda`) — con tests
- `tandas_produccion.pedido_item_id`: trazabilidad pedido↔producción
- Vistas `/snack` y `/buffet`: pedir, seguimiento en tiempo real, disponibilidad de tandas, historial y métricas del turno
- RLS de `pedidos`/`pedido_items` extendida (corrige hueco latente de roles de área)

Spec: `docs/superpowers/specs/2026-06-11-cierre-operacional-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Solicitar code review**

Usar la skill `superpowers:requesting-code-review` sobre el diff del PR; atender hallazgos antes del merge.

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura de spec (Frente 1):** roles/canales (T1-T2) ✓ · auth/routing (T1) ✓ · catálogo elaboraciones + ruteo (T5, ruteo ya existía) ✓ · `pedido_item_id` (T3+T6) ✓ · anti-doble-descuento con test obligatorio (T4) ✓ · UI 5 secciones (T8-T9: pedir, activos, disponibilidad, historial, métricas) ✓ · i18n es/en (T8-T9) ✓ · E2E (T10) ✓ · RLS multi-tenant (T3) ✓.
- **Sin placeholders:** todo step de código incluye el código; los puntos donde el ejecutor adapta fixtures existentes lo dicen explícitamente con el criterio.
- **Consistencia de tipos:** `recetaTipo` (T4) se usa igual en domain/infra/tests · `CartaElaboracion` (T5) coincide con props de T8 · `findCompletadasByZona(tenantId, zona, horas)` (T6) coincide con el test · `ZONA_CHANNEL` (T2) se consume en T8.
- **Fuera de alcance (no agregar):** requisiciones (Frente 2, plan aparte) · auditoría de turnos (Frente 3, plan aparte) · stock por ubicación · rol recepcion.
