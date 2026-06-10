# Cierre de Auditoría 2026-06-09 + Núcleo Operacional — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los merge-blockers de la auditoría 2026-06-09 (testing/coverage, fixes de migraciones no aplicadas), ejecutar la higiene (docs, código muerto, chat) y dejar listo el camino para el hito de merge a main y las fases de producto (trazabilidad, K2, M1/M2).

**Architecture:** El proyecto es un monorepo pnpm con módulos hexagonales (`domain → application → infrastructure → actions.ts`). Las migraciones del refoco (posteriores a `20260526200000`) NO están aplicadas en producción — se pueden editar in-place sin riesgo hasta el merge. El merge a main dispara `supabase db push` en CI y aplica TODO de golpe, incluida la migración destructiva `20260528000000`; por eso el merge es un hito gateado al final, nunca un paso intermedio.

**Tech Stack:** Next.js 15 · TypeScript strict · Supabase/Postgres 15 · Vitest · Playwright · Socket.io · pnpm.

**Decisiones tomadas (con contexto, 2026-06-09):**

- **D1 — Chat se elimina.** Decisión del dueño documentada en el plan maestro v2 (2026-05-28): "Chat se elimina (como snack/buffet)". Sigue montado en el layout; este plan ejecuta la baja.
- **D2 — `lotes.costo_unitario` pasa a `numeric(14,4)`.** El dominio calcula costos netos a 4 decimales y la columna a 2 trunca costos por gramo (hallazgo A3 Cerberus). Mínimo cambio correcto.
- **D3 — Fixes multi-tenant van pre-merge.** Regla del proyecto: diseñar siempre multi-tenant. Reclasificación de recetas `'cocina'` + triggers de tenant en `pedido_items`/`pedido_eventos`/`pedido_item_eventos`.
- **D4 — El merge a main NO lo ejecuta este plan.** Es un hito con checklist; requiere OK explícito del dueño en el momento.
- **D5 — Backfill de `20260601000001` se corrige editando el archivo** (no está aplicado en ningún entorno).
- **D6 — K2 y M1/M2 requieren su propio ciclo brainstorming→spec→plan.** Aquí solo figuran como tareas de planificación. El panel de trazabilidad ya tiene plan detallado (Fase 4 de `2026-06-01-kds-despacho-por-item-trazabilidad.md`) y se ejecuta por referencia.

**Verificación estándar de cada tarea:** `pnpm lint && pnpm typecheck && pnpm test` (416 tests verdes al inicio del plan). Commits en español, Conventional Commits.

---

## FASE 1 — Merge-blockers

### Task 1: Guard de idempotencia en el backfill de estado por ítem

**Files:**

- Modify: `supabase/migrations/20260601000001_kds_estado_por_item.sql:51-61`

La migración no está aplicada en ningún entorno; se edita in-place. Los UPDATEs del backfill se re-ejecutarían en cada corrida sobrescribiendo `listo_at`/`en_preparacion_at`.

- [ ] **Step 1: Añadir guards a los dos UPDATEs**

Reemplazar el bloque 3 (backfill) por:

```sql
-- 3) Backfill del estado de ítems según el estado del pedido (idempotente:
--    solo toca ítems que siguen en el default 'pendiente').
UPDATE public.pedido_items it
SET estado = 'listo', listo_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id
  AND p.estado IN ('despachado', 'entregado')
  AND it.estado = 'pendiente';

UPDATE public.pedido_items it
SET estado = 'en_preparacion', en_preparacion_at = p.updated_at
FROM public.pedidos p
WHERE it.pedido_id = p.id
  AND p.estado = 'en_preparacion'
  AND it.estado = 'pendiente';
```

- [ ] **Step 2: Verificar sintaxis SQL (sin DB local — revisión visual + lint del repo)**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0 (la migración no afecta TS; el lint confirma que no se rompió nada más).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601000001_kds_estado_por_item.sql
git commit -m "fix(db): backfill de estado por ítem idempotente (guard estado='pendiente')"
```

---

### Task 2: Reclasificar recetas legacy `area_produccion='cocina'`

**Files:**

- Create: `supabase/migrations/20260609000001_reclasificar_recetas_cocina.sql`

Las recetas con `'cocina'` son irruteables (la matriz `ZONA_AREAS_PERMITIDAS` no incluye ese valor). En el tenant actual no hay casos (el catálogo real las recargó), pero en multi-tenant un catálogo legacy rompería `createPedido`.

- [ ] **Step 1: Crear la migración**

```sql
-- =============================================================================
-- 20260609000001_reclasificar_recetas_cocina.sql
-- Reclasifica recetas legacy del área inerte 'cocina' a 'cocina_caliente'
-- (default operativo; el admin reclasifica finamente desde /recetas).
-- Sin esto, una receta 'cocina' es irruteable: ZONA_AREAS_PERMITIDAS no la
-- incluye y createPedido la rechaza. Idempotente (segunda corrida = 0 filas).
-- Debe correr DESPUÉS de 20260528000001 (ADD VALUE no es usable en la misma
-- transacción en que se crea — por eso va en archivo separado).
-- =============================================================================

UPDATE public.recetas
SET area_produccion = 'cocina_caliente'
WHERE area_produccion = 'cocina';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260609000001_reclasificar_recetas_cocina.sql
git commit -m "fix(db): reclasificar recetas legacy 'cocina' a cocina_caliente (ruteo multi-tenant)"
```

---

### Task 3: Triggers de validación de tenant en pedido_items / pedido_eventos / pedido_item_eventos

**Files:**

- Create: `supabase/migrations/20260609000002_tenant_guard_pedidos_hijos.sql`
- Referencia de patrón: `supabase/migrations/20260504000000_0011_tenant_fk_validation.sql` (función genérica `fn_assert_same_tenant` ya existe — reutilizarla, no recrearla)

- [ ] **Step 1: Crear la migración**

```sql
-- =============================================================================
-- 20260609000002_tenant_guard_pedidos_hijos.sql
-- Defensa en profundidad (patrón 0011): triggers que garantizan que las FK de
-- las tablas hijas de pedidos pertenecen al mismo tenant que la fila.
-- RLS cubre el caso normal; esto bloquea bypass accidental vía service_role.
-- Idempotente.
-- =============================================================================

-- ── pedido_items: pedido_id y receta_id del mismo tenant ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_item_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  PERFORM public.fn_assert_same_tenant('recetas', NEW.receta_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_item_tenant ON public.pedido_items;
CREATE TRIGGER tg_pedido_item_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_item_tenant();

-- ── pedido_eventos: pedido_id del mismo tenant ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_evento_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_evento_tenant ON public.pedido_eventos;
CREATE TRIGGER tg_pedido_evento_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_evento_tenant();

-- ── pedido_item_eventos: pedido_id e item_id del mismo tenant ────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_item_evento_tenant()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.fn_assert_same_tenant('pedidos', NEW.pedido_id, NEW.tenant_id);
  PERFORM public.fn_assert_same_tenant('pedido_items', NEW.item_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pedido_item_evento_tenant ON public.pedido_item_eventos;
CREATE TRIGGER tg_pedido_item_evento_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_item_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_item_evento_tenant();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260609000002_tenant_guard_pedidos_hijos.sql
git commit -m "feat(db): triggers de validación de tenant en tablas hijas de pedidos"
```

---

### Task 4: Precisión de costo — `lotes.costo_unitario` a numeric(14,4)

**Files:**

- Create: `supabase/migrations/20260609000003_costo_unitario_precision.sql`

El dominio (`costoUnitarioNeto`) calcula a 4 decimales; con unidades en gramos el costo unitario es sub-céntimo y `numeric(14,2)` lo trunca, amplificando el error en recetas grandes.

- [ ] **Step 1: Crear la migración**

```sql
-- =============================================================================
-- 20260609000003_costo_unitario_precision.sql
-- A3 (auditoría Cerberus): con unidades base en g/ml el costo unitario por
-- gramo es sub-céntimo; numeric(14,2) truncaba lo que el dominio calcula a 4
-- decimales (costoUnitarioNeto). El total monetario sigue en numeric(14,2).
-- Re-ejecutable (ALTER TYPE al mismo tipo es un no-op funcional).
-- =============================================================================

ALTER TABLE public.lotes
  ALTER COLUMN costo_unitario TYPE numeric(14,4);
```

- [ ] **Step 2: Verificar que el código TS no fija 2 decimales al leer/escribir costo_unitario**

Run: `grep -rn 'costo_unitario\|costoUnitario' apps/web/src/modules/inventory apps/web/src/modules/costos --include='*.ts' | grep -i 'toFixed(2)\|round.*2)'`
Expected: sin matches (si aparece alguno, ajustar a 4 decimales en ese punto y reportarlo en el commit).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609000003_costo_unitario_precision.sql
git commit -m "fix(db): costo_unitario a numeric(14,4) — precisión sub-céntimo por gramo (A3)"
```

---

### Task 5: Tests de integración de transiciones de ítem (actions.ts)

**Files:**

- Create: `apps/web/src/modules/orders/tests/actions-item-transitions.test.ts`
- Referencia (no modificar): `apps/web/src/modules/orders/actions.ts:501-604`

Primeros tests sobre la capa de Server Actions (hoy 0). Se mockean los seams (`assertCan`, `auditLog`, `emitEvent`, clientes Supabase, repo) y se verifica la orquestación real: permiso por área, transición inválida, recall bloqueado en pedido cerrado.

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  rpc: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
  findItemForTransition: vi.fn(),
  transitionItem: vi.fn(),
  findByIdForDelivery: vi.fn(),
  transition: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/modules/orders/infrastructure/order-repository', () => ({
  createOrderRepository: () => ({
    findItemForTransition: mocks.findItemForTransition,
    transitionItem: mocks.transitionItem,
    findByIdForDelivery: mocks.findByIdForDelivery,
    transition: mocks.transition,
  }),
}));

import { iniciarItem, recallItem } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'chef_cocina_fria' };

describe('transiciones de ítem KDS (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  it('iniciarItem exige el permiso de escritura del área real del ítem', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      pedidoId: 'p1',
      area: 'cocina_fria',
      estado: 'pendiente',
      pedidoEstado: 'recibido_cocina',
      zona: 'snack',
    });
    mocks.transitionItem.mockResolvedValue({ pedidoEstado: 'en_preparacion' });

    const result = await iniciarItem('i1', 3);

    expect(result.ok).toBe(true);
    expect(mocks.assertCan).toHaveBeenCalledWith('cocina_fria:write');
    expect(mocks.transitionItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'i1', nuevoEstado: 'en_preparacion', pedidoVersion: 3 }),
    );
    expect(mocks.auditLog).toHaveBeenCalled();
  });

  it('rechaza recall de un ítem cuyo pedido ya está cerrado', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      pedidoId: 'p1',
      area: 'cocina_fria',
      estado: 'listo',
      pedidoEstado: 'entregado',
      zona: 'snack',
    });

    const result = await recallItem('i1', 5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(mocks.transitionItem).not.toHaveBeenCalled();
  });

  it('rechaza ítem sin área productiva asignada', async () => {
    mocks.findItemForTransition.mockResolvedValue({
      pedidoId: 'p1',
      area: null,
      estado: 'pendiente',
      pedidoEstado: 'recibido_cocina',
      zona: 'snack',
    });

    const result = await iniciarItem('i1', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});
```

- [ ] **Step 2: Correr y verificar comportamiento**

Run: `pnpm --filter @dorado/web exec vitest run src/modules/orders/tests/actions-item-transitions.test.ts`
Expected: los 3 tests PASAN si la implementación es correcta (el "falla primero" aquí valida que los mocks enganchan: si algún mock no intercepta, el test revienta con error de Supabase env). Si falla por shape del item (`findItemForTransition`), leer `apps/web/src/modules/orders/infrastructure/order-repository.ts` y ajustar el fixture al tipo real `ItemForTransition` — NO cambiar la implementación.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/modules/orders/tests/actions-item-transitions.test.ts
git commit -m "test(orders): integración de transiciones de ítem en actions (permiso por área, recall, validación)"
```

---

### Task 6: Tests de integración de entregarPedido (FEFO + idempotency key)

**Files:**

- Create: `apps/web/src/modules/orders/tests/actions-entregar-pedido.test.ts`
- Referencia (no modificar): `apps/web/src/modules/orders/actions.ts:328-408`

- [ ] **Step 1: Escribir el test**

Mismo bloque de mocks `vi.hoisted` + `vi.mock` que en Task 5 (repetirlo completo en este archivo; los tests deben ser autónomos). Luego:

```typescript
import { entregarPedido } from '@/modules/orders/actions';

const CTX = { tenantId: 't1', userId: 'u1', role: 'mesero_amex' };

describe('entregarPedido (actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX);
  });

  const pedidoListo = {
    id: 'p1',
    estado: 'despachado',
    zona: 'amex',
    items: [
      {
        id: 'i1',
        cantidad: 2,
        recetaPorciones: 4,
        ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Pan', cantidadPorBatch: 100 }],
      },
    ],
  };

  it('descuenta vía RPC FEFO con cantidad neta e idempotency key determinística', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedidoListo);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.transition.mockResolvedValue({ id: 'p1', estado: 'entregado', updatedAt: new Date() });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'fn_descontar_insumo_fefo',
      expect.objectContaining({
        p_tenant_id: 't1',
        p_insumo_id: 'ins1',
        p_cantidad: 50, // (100 / 4 porciones) * 2 pedidos
        p_idempotency_key: 'pedido:p1:item:i1:ing:ins1',
        p_tipo: 'salida_receta',
      }),
    );
    expect(mocks.transition).toHaveBeenCalledWith('p1', 't1', 'entregado', 7);
  });

  it('stock insuficiente (P0001) → STOCK_INSUFICIENTE y NO transiciona el pedido', async () => {
    mocks.findByIdForDelivery.mockResolvedValue(pedidoListo);
    mocks.rpc.mockResolvedValue({ error: { code: 'P0001', message: 'stock insuficiente' } });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('STOCK_INSUFICIENTE');
    expect(mocks.transition).not.toHaveBeenCalled();
  });

  it('transición inválida no descuenta stock', async () => {
    mocks.findByIdForDelivery.mockResolvedValue({ ...pedidoListo, estado: 'creado' });

    const result = await entregarPedido('p1', 7);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TRANSITION');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests**

Run: `pnpm --filter @dorado/web exec vitest run src/modules/orders/tests/actions-entregar-pedido.test.ts`
Expected: PASS (3 tests). Si el fixture de `findByIdForDelivery` no matchea el tipo real, leer `order-repository.ts` y ajustar el fixture, no la implementación.

- [ ] **Step 3: Suite completa + commit**

Run: `pnpm --filter @dorado/web test`
Expected: PASS (317 + 6 nuevos).

```bash
git add apps/web/src/modules/orders/tests/actions-entregar-pedido.test.ts
git commit -m "test(orders): integración de entregarPedido — FEFO, idempotency key, transición inválida"
```

---

### Task 7: Coverage en CI

**Files:**

- Modify: `.github/workflows/ci.yml` (job `test`, step "Test", línea ~145)

- [ ] **Step 1: Verificar que coverage corre localmente**

Run: `pnpm --filter @dorado/web exec vitest run --coverage 2>&1 | tail -20`
Expected: tabla de coverage y exit 0 (thresholds 75% global / 90% merma ya configurados en `vitest.config.ts`). Si crashea, reportar el error ANTES de tocar CI — el override `brace-expansion>=5.0.6` debería haberlo resuelto.

- [ ] **Step 2: Añadir el step de coverage al job test**

Después del step `- name: Test` / `run: pnpm test` añadir:

```yaml
- name: Coverage (dominio web — thresholds 75%/90%)
  run: pnpm --filter @dorado/web exec vitest run --coverage
```

- [ ] **Step 3: Commit y verificar CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: coverage de dominio web con thresholds en pipeline (cierra C5 parcial)"
git push origin feature/refoco-operacional
```

Run: `gh run watch $(gh run list --branch feature/refoco-operacional --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: job Test verde con el nuevo step.

---

### Task 8: E2E — eliminar skips incondicionales

**Files:**

- Modify: `apps/web/e2e/pedido-lifecycle.spec.ts:14,108`
- Modify: `apps/web/e2e/auth.spec.ts:25`

- [ ] **Step 1: Leer ambos specs completos** (los números de línea pueden haber derivado).

- [ ] **Step 2: Condicionar los skips a credenciales reales**

Reemplazar cada `test.skip(true, ...)` / `test.skip()` incondicional por un guard de entorno, p. ej.:

```typescript
test.skip(!process.env['E2E_ADMIN_EMAIL'], 'requiere credenciales E2E (E2E_ADMIN_EMAIL)');
```

usando la variable de entorno que el propio spec ya consume (ver `playwright.config.ts` y los secretos `E2E_*` de CI).

- [ ] **Step 3: Reemplazar la aserción tautológica de pedido-lifecycle.spec.ts:~108**

La aserción tipo "llegamos aquí sin error" debe verificar estado observable del KDS, p. ej. que la card del pedido creado aparece en la columna de nuevos:

```typescript
await expect(page.getByTestId(`pedido-card-${pedidoId}`)).toBeVisible();
```

Ajustar el selector al que use realmente `pedido-card.tsx` (leerlo antes; si no hay `data-testid`, añadirlo al componente como parte de este task).

- [ ] **Step 4: Verificar que la suite E2E compila y corre (con credenciales del .env.local si existen)**

Run: `pnpm --filter @dorado/web test:e2e 2>&1 | tail -15`
Expected: tests corren o se saltan con razón explícita de env faltante — nunca `skip(true)`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/ apps/web/src/components/kds/
git commit -m "test(e2e): skips condicionados a credenciales + aserciones reales en lifecycle"
```

---

## FASE 2 — Higiene

### Task 9: Eliminar módulo chat (decisión D1)

**Files:**

- Modify: `apps/web/src/app/(dashboard)/layout.tsx` (quitar `ChatPanel`, `ROLE_CHAT_CHANNEL`, `CHAT_TITULO_KEYS` y sus usos en el JSX)
- Delete: `apps/web/src/components/chat/` (chat-panel.tsx, mensaje-bubble.tsx)
- Delete: `apps/web/src/modules/chat/`
- Modify: `apps/web/src/messages/es.json` y `en.json` (eliminar namespace `chat`)
- Create: `supabase/migrations/20260609000004_remove_chat.sql`

- [ ] **Step 1: Quitar ChatPanel del layout** — eliminar el import, los mapas `ROLE_CHAT_CHANNEL`/`CHAT_TITULO_KEYS` y el render de `<ChatPanel … />` en el JSX (leer el archivo completo primero).

- [ ] **Step 2: Borrar componentes y módulo**

```bash
git rm -r apps/web/src/components/chat apps/web/src/modules/chat
```

- [ ] **Step 3: Typecheck (rojo esperado si quedan consumidores) y limpiar restos**

Run: `pnpm --filter @dorado/web typecheck`
Expected: errores solo en archivos que importen chat; eliminar esos imports/usos. Buscar restos: `grep -rn 'modules/chat\|ChatPanel\|mensajes_chat' apps/web/src packages/`

- [ ] **Step 4: Eliminar namespace `chat` de es.json/en.json** (objeto top-level `"chat"` completo en ambos).

- [ ] **Step 5: Migración destructiva diferida (aplica al merge, mismo gate que 20260528000000)**

```sql
-- =============================================================================
-- 20260609000004_remove_chat.sql
-- Baja del módulo chat (decisión del dueño 2026-05-28, plan maestro v2).
-- Destructiva — aplica al merge a main junto con 20260528000000 (gate dueño).
-- =============================================================================

DROP TABLE IF EXISTS public.mensajes_chat;
```

- [ ] **Step 6: Suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: verde (los 6 tests de chat-domain desaparecen con el módulo).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(chat): baja del módulo chat — decisión refoco operacional (D1)"
```

---

### Task 10: Limpieza de código muerto (scripts + claves i18n huérfanas)

**Files:**

- Delete: `scripts/fix-app-metadata.mjs`, `scripts/reset-users.mjs`, `scripts/reset-users.sql`
- Modify: `apps/web/src/messages/es.json`, `apps/web/src/messages/en.json` (namespaces `afluencia`, `snack`, `buffet`)

- [ ] **Step 1: Confirmar que nada los referencia**

Run: `grep -rn 'fix-app-metadata\|reset-users' package.json .github/ docs/ scripts/ --include='*' | grep -v reset-test-users`
Expected: sin matches vivos (solo menciones históricas en docs de auditoría, que se conservan).

- [ ] **Step 2: Borrar scripts**

```bash
git rm scripts/fix-app-metadata.mjs scripts/reset-users.mjs scripts/reset-users.sql
```

- [ ] **Step 3: Quitar namespaces `afluencia`, `snack`, `buffet` de es.json y en.json**

Antes verificar 0 usos: `grep -rn "useTranslations('afluencia')\|useTranslations('snack')\|useTranslations('buffet')\|getTranslations('afluencia')\|getTranslations('snack')\|getTranslations('buffet')" apps/web/src`
Expected: sin matches. (OJO: `zonas` y `categoriasMenu` se quedan — snack/buffet siguen existiendo como ZONAS de origen.)

- [ ] **Step 4: Suite + commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`

```bash
git add -A
git commit -m "chore: limpiar scripts huérfanos y claves i18n de módulos eliminados"
```

---

### Task 11: C-19 — mover cálculo de cantidadNeta a application/

**Files:**

- Create: `apps/web/src/modules/orders/application/calcular-descuentos.ts`
- Modify: `apps/web/src/modules/orders/actions.ts:346-377` (entregarPedido)
- Create: `apps/web/src/modules/orders/tests/calcular-descuentos.test.ts`

- [ ] **Step 1: Test que falla**

```typescript
import { describe, it, expect } from 'vitest';
import { calcularDescuentosPedido } from '@/modules/orders/application/calcular-descuentos';

describe('calcularDescuentosPedido', () => {
  it('calcula cantidad neta por ítem×ingrediente con idempotency key determinística', () => {
    const descuentos = calcularDescuentosPedido('p1', [
      {
        id: 'i1',
        cantidad: 2,
        recetaPorciones: 4,
        ingredientes: [{ insumoId: 'ins1', insumoNombre: 'Pan', cantidadPorBatch: 100 }],
      },
    ]);

    expect(descuentos).toEqual([
      {
        insumoId: 'ins1',
        insumoNombre: 'Pan',
        cantidad: 50,
        idempotencyKey: 'pedido:p1:item:i1:ing:ins1',
      },
    ]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla** (módulo no existe).

- [ ] **Step 3: Implementar**

```typescript
// Modelo F3: la merma se aplicó en la recepción (stock neto), por lo que el
// consumo descuenta la cantidad neta de la receta directa.
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
  ingredientes: { insumoId: string; insumoNombre: string; cantidadPorBatch: number }[];
}

export function calcularDescuentosPedido(
  pedidoId: string,
  items: ItemEntrega[],
): DescuentoInsumo[] {
  return items.flatMap((item) =>
    item.ingredientes.map((ing) => ({
      insumoId: ing.insumoId,
      insumoNombre: ing.insumoNombre,
      cantidad: (ing.cantidadPorBatch / item.recetaPorciones) * item.cantidad,
      idempotencyKey: `pedido:${pedidoId}:item:${item.id}:ing:${ing.insumoId}`,
    })),
  );
}
```

- [ ] **Step 4: Usar en entregarPedido** — reemplazar el doble loop por `const descuentos = calcularDescuentosPedido(pedidoId, pedido.items);` y un único `for (const d of descuentos)` que llama la RPC con `d.cantidad`/`d.idempotencyKey` (mantener el manejo de error P0001 idéntico, usando `d.insumoNombre`).

- [ ] **Step 5: Suite completa (los tests de Task 6 protegen la equivalencia)**

Run: `pnpm --filter @dorado/web test`
Expected: PASS — en particular `actions-entregar-pedido.test.ts` sin cambios.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/orders/
git commit -m "refactor(orders): cálculo de descuentos de entrega a application/ (C-19)"
```

---

### Task 12: Tests de dominio para costos

**Files:**

- Create: `apps/web/src/modules/costos/tests/costo-mapper.test.ts` — el módulo tiene 0 tests
- Referencia (no modificar): `apps/web/src/modules/costos/domain/costo.ts` (única función: `costoRecetaFromRpcRow`)

- [ ] **Step 1: Escribir los tests del mapper RPC→dominio**

```typescript
import { describe, it, expect } from 'vitest';
import { costoRecetaFromRpcRow } from '@/modules/costos/domain/costo';

describe('costoRecetaFromRpcRow', () => {
  const row = {
    receta_id: 'r1',
    porciones: '4',
    costo_total: '12500.5000',
    costo_por_porcion: '3125.1250',
    tiene_costo_completo: true,
    ingredientes: [
      {
        insumo_id: 'ins1',
        insumo_nombre: 'Harina',
        unidad_medida: 'g',
        cantidad: '500.0000',
        merma_coeficiente: '0.0500',
        cantidad_bruta: '526.3158',
        precio_unitario: '4.2000',
        costo_ingrediente: '2100.0000',
      },
    ],
  };

  it('convierte numerics string de la RPC a number', () => {
    const costo = costoRecetaFromRpcRow(row);
    expect(costo.porciones).toBe(4);
    expect(costo.costoTotal).toBe(12500.5);
    expect(costo.costoPorPorcion).toBe(3125.125);
    expect(costo.ingredientes[0]?.precioUnitario).toBe(4.2);
  });

  it('precio/costo null cuando el insumo no tiene lote (sin costo)', () => {
    const sinPrecio = {
      ...row,
      costo_por_porcion: null,
      tiene_costo_completo: false,
      ingredientes: [{ ...row.ingredientes[0], precio_unitario: null, costo_ingrediente: null }],
    };
    const costo = costoRecetaFromRpcRow(sinPrecio);
    expect(costo.costoPorPorcion).toBeNull();
    expect(costo.tieneCostoCompleto).toBe(false);
    expect(costo.ingredientes[0]?.precioUnitario).toBeNull();
    expect(costo.ingredientes[0]?.costoIngrediente).toBeNull();
  });

  it('ingredientes no-array y costo_total ausente degradan a [] y 0', () => {
    const costo = costoRecetaFromRpcRow({
      receta_id: 'r1',
      porciones: '1',
      costo_total: null,
      costo_por_porcion: null,
      tiene_costo_completo: false,
      ingredientes: null,
    });
    expect(costo.ingredientes).toEqual([]);
    expect(costo.costoTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Correr, verificar verde, commit**

```bash
git add apps/web/src/modules/costos/tests/
git commit -m "test(costos): cobertura de dominio (antes 0 tests)"
```

---

### Task 13: Actualizar CLAUDE.md al estado real

**Files:**

- Modify: `CLAUDE.md`

Drift crítico: cualquier agente que siga CLAUDE.md hoy implementa la merma al revés.

- [ ] **Step 1: Principio Rector (línea ~44)** — reemplazar por:

```markdown
**Nada sale de cocina sin receta.** Todo movimiento de inventario está vinculado a una receta. La merma se aplica UNA VEZ en la recepción vía `insumos.merma_default` (el inventario guarda el NETO); el consumo descuenta cantidades netas directas. No existe descuento sin receta. Ante cualquier duda, **parar y preguntar antes de codificar**.
```

- [ ] **Step 2: Sección Merma (línea ~132-134)** — reemplazar por:

```markdown
### Merma — en recepción (modelo F3, 2026-05-30)

`modules/inventory/domain/merma.ts`: `aplicarMermaRecepcion(comprado, coef) = comprado × (1 - coef)` y `costoUnitarioNeto = costo / (1 - coef)` (preserva el valor total del lote). La fuente autoritativa del coeficiente es `insumos.merma_default`; `receta_ingredientes.merma_coeficiente` es histórico. Coverage 90%+ obligatorio.
```

- [ ] **Step 3: Tabla de módulos** — dejar solo los 12 reales post-chat: inventory, recipes, production, orders, turnos, analytics, feature-flags, superuser, cocina-amex, proveedores, alertas, costos. Eliminar filas buffet, snack, afluencia, chat, flights, audit. Añadir nota: "audit vive como `lib/audit.ts` + hash chain en Postgres, no como módulo".

- [ ] **Step 4: Tabla UIs por Rol** — actualizar a las rutas reales: quitar `/afluencia`, `/snack`, `/buffet` (filas recepcion, personal_snack, personal_buffet quedan como "rol sin UI dedicada — pendiente K2" o se eliminan según roles vigentes en `lib/auth/permissions.ts` — verificar ahí); añadir `chef_cocina_fria → /cocina-fria` y `chef_cocina_caliente → /cocina-caliente` (KDS por área con despacho por ítem).

- [ ] **Step 5: Sección Capas y zonas** — actualizar la tabla "Cuándo descuenta": Amex al confirmar entrega (vigente); Snack/Buffet son ZONAS de origen de pedido (sin inventario propio); el descuento ocurre en la entrega del pedido. Sección Analytics: eliminar `cogs_per_passenger` y `cash_outflow_per_passenger` (las MV se eliminaron con afluencia); dejar los KPIs de consumo vigentes (verificar en `modules/analytics`).

- [ ] **Step 6: Topología Real-time** — actualizar el diagrama: nodos de producción COCINA_FRIA / COCINA_CALIENTE / COCINA_AMEX / PASTELERÍA; zonas de origen AMEX / SNACK / BUFFET. Mencionar evento `ITEM_ESTADO`.

- [ ] **Step 7: Footer de versión** — `_v6.0 — Junio 2026 · Refoco operacional: 4 KDS por área, despacho por ítem, merma en recepción, unidades g/ml/unidad_`.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md v6.0 — refleja refoco operacional (merma recepción, módulos y rutas reales)"
```

---

### Task 14: README + archivar reportes de auditoría en raíz

**Files:**

- Modify: `README.md`
- Move: `enterpriseaudit20260527.md`, `FIX_REPORT.md`, `SECURITY_HARDENING.md`, `ARCHITECTURE_IMPROVEMENTS.md`, `PRODUCTION_CHECKLIST.md` → `docs/audit/2026-05-27-enterprise/`

- [ ] **Step 1: README** — actualizar la línea de scope (quitar "snack, buffet" como módulos; describir: "recepción de bodega, 4 KDS por área (caliente/fría/pastelería/AMEX), trazabilidad por ítem y administración") y el contador de tests (`pnpm test # Vitest` sin número hardcodeado — evita drift futuro).

- [ ] **Step 2: Archivar reportes**

```bash
mkdir -p docs/audit/2026-05-27-enterprise
git mv enterpriseaudit20260527.md FIX_REPORT.md SECURITY_HARDENING.md ARCHITECTURE_IMPROVEMENTS.md PRODUCTION_CHECKLIST.md docs/audit/2026-05-27-enterprise/
```

(PRODUCTION_CHECKLIST.md solo se mueve si ya se ejecutó el post-deploy manual; si no es verificable, se mueve igual y se referencia desde el hito de merge.)

- [ ] **Step 3: Verificar referencias rotas**

Run: `grep -rn 'FIX_REPORT\|PRODUCTION_CHECKLIST\|SECURITY_HARDENING\|ARCHITECTURE_IMPROVEMENTS\|enterpriseaudit' --include='*.md' --include='*.ts' --include='*.yml' . | grep -v node_modules | grep -v docs/audit`
Expected: actualizar cualquier referencia con la nueva ruta.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README al estado real + archivo de reportes enterprise en docs/audit/"
```

---

### Task 15: ARCHITECTURE.md — correcciones de drift dirigidas

**Files:**

- Modify: `ARCHITECTURE.md` (último cambio 2026-05-13 — pre-refoco; 36 menciones a módulos eliminados)

Alcance acotado: NO reescribir el documento; corregir solo lo que contradice el código.

- [ ] **Step 1: §ER/tablas** — eliminar/marcar como eliminadas: `vuelos*`, `afluencia_ingresos`, `buffet_tickets_turno`, `mensajes_chat` (post Task 9), stock-out snack/buffet. Añadir: `pedido_item_eventos`, columnas nuevas de `pedido_items` (estado, area_produccion, timestamps/actores), `pedidos.prioridad/cocinero_id`, `proveedores`, `alertas`.

- [ ] **Step 2: §Algoritmos/merma** — reemplazar la fórmula merma-en-consumo por el modelo F3 (mismo texto de Task 13 Step 2). Actualizar `merma_coeficiente` → `insumos.merma_default` como fuente autoritativa.

- [ ] **Step 3: Añadir ADR breve al final**: "ADR-RefocoOperacional (2026-05-28/2026-06-01): pivote ERP→plataforma operacional; remoción afluencia/snack/buffet/flights/chat; split área caliente/fría; ruteo por matriz `ZONA_AREAS_PERMITIDAS`; estado por ítem con log append-only `pedido_item_eventos`; merma en recepción; unidades {g, ml, unidad}."

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: ARCHITECTURE.md — drift post-refoco (ER, merma F3, ADR refoco operacional)"
```

---

## FASE 3 — Producto (núcleo del refoco)

### Task 16: Panel de trazabilidad admin (Fase 4 del plan KDS)

**Files:** los definidos en `docs/superpowers/plans/2026-06-01-kds-despacho-por-item-trazabilidad.md` (Phase 4, líneas ~950-1090) — el plan detallado YA EXISTE con código completo.

- [ ] **Step 1: Ejecutar las Tasks de Phase 4 del plan KDS** (tipos/casos de uso de trazabilidad, exponer acciones en actions.ts — parcialmente hecho: `getEventosPedido` existe en `orders/actions.ts:461` —, página server admin, panel cliente con tabla maestra + fila expandible, entrada en sidebar admin) siguiendo sus steps con checkbox tal como están escritos allí.
- [ ] **Step 2: Marcar los checkboxes ejecutados EN AMBOS planes** (el de KDS y este).
- [ ] **Step 3: Verificación manual en localhost + commit según los steps del plan KDS.**

### Task 17: K2 — Interfaces de origen Snack/Buffet (planificación)

- [ ] **Step 1: Sesión de brainstorming con el dueño** (superpowers:brainstorming) — decisiones abiertas: ¿1 interfaz parametrizada o 2 rutas?, ¿qué roles la usan (los roles `personal_snack`/`personal_buffet` siguen en permissions.ts)?, ¿confirmación de entrega en zona?
- [ ] **Step 2: Spec en `docs/superpowers/specs/` + plan propio en `docs/superpowers/plans/`.** No implementar dentro de este plan.

### Task 18: M1/M2 — Métricas operacionales (planificación)

- [ ] **Step 1: Brainstorming + spec**: `mv_tiempos_pedido` (ahora con datos por ÍTEM de `pedido_item_eventos` — el plan maestro lo definió a nivel pedido antes del despacho por ítem; hay que re-decidir el grano), `mv_productividad_cocinero`, dashboard en vivo.
- [ ] **Step 2: Plan propio.** No implementar dentro de este plan.

---

## HITO M — Merge a main (GATE: OK explícito del dueño)

**NO ejecutar sin aprobación verbal del dueño en el momento.** El merge aplica vía CI ~30 migraciones a producción, incluidas las destructivas `20260528000000` (vuelos/afluencia/snack/buffet) y `20260609000004` (chat).

Checklist previo:

- [ ] Fases 1 y 2 completas; CI verde con coverage.
- [ ] Backup manual de la DB de producción verificado (workflow backup.yml corrido el mismo día).
- [ ] Confirmar `schema_migrations` remoto sigue en `20260526200000` (sin sorpresas).
- [ ] OK explícito del dueño.
- [ ] PR `feature/refoco-operacional → main`, merge, vigilar CI (`gh run watch`), smoke test post-deploy (`docs/runbooks/post-fix-smoke-test.md` + `docs/qa/ui-smoke-checklist.md`).

---

## BACKLOG documentado (no en este plan)

- **H8** — Optimistic locking a nivel ítem (`transitionItem` sin versión propia; hoy protege la versión del pedido). Requiere design review.
- **H14** — `audit_log` al rechazar canal Socket.io (CLAUDE.md lo exige). Decisión de diseño pendiente: el socket-server no tiene acceso a DB — opciones: service-role en Render vs endpoint web autenticado.
- **H15** — Refactor god-component `qr-passenger-app.tsx` (1379 líneas, objeto TEXTS duplicando `messages/{fr,pt}.json` namespace `qr`).
- Tests de application para recipes/superuser/alertas/cocina-amex; pgTAP para RLS.
- Convergencia cocina-amex al flujo por ítem (baja de `iniciarPreparacionAmex`/`despacharPedidoAmex`; verificar si `recibirPedidoAmex` tiene consumidores).
- Deuda enterprise legacy: A-16 (runbook DR vs formato backup), A-26 (monitoreo externo de backups), M-37 (CORS socket en previews), M-38 (doble disparo de alertas).
