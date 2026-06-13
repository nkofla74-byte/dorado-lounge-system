# Frente 2 — Requisiciones cocina → almacén · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Dar a cada cocina (caliente, fría, AMEX, pastelería) la capacidad de solicitar insumos al almacén con trazabilidad de estado en tiempo real, sin mover inventario.

**Architecture:** Módulo hexagonal nuevo `requisiciones` (`domain → application → infrastructure → actions.ts`). Coordinación pura — **cero movimientos de inventario**: el stock solo se descuenta vía receta (Principio Rector). Máquina de estados con optimistic locking. Tabla de eventos append-only (mismo patrón que `pedido_eventos`). Canal Socket.io nuevo `sala:almacen`. Alertas de demora vía el cron existente.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · Supabase (PostgreSQL + RLS) · Zod · Socket.io · Vitest · Playwright · next-intl.

**Spec de referencia:** `docs/superpowers/specs/2026-06-11-cierre-operacional-design.md` §"Frente 2".

---

## Decisiones de nombres (fijas — consistencia entre tareas)

- **Estados:** `solicitada → en_alistamiento → despachada → recibida`; cancelable solo en `solicitada`.
- **Enum SQL:** `public.estado_requisicion`. **Tipo TS:** `EstadoRequisicion`.
- **Tablas:** `requisiciones`, `requisicion_items`, `requisicion_eventos`.
- **Canal:** `CHANNELS.ALMACEN = 'sala:almacen'`. **Evento:** `REQUISICION_ESTADO`.
- **Módulo:** `apps/web/src/modules/requisiciones/`.
- **Permisos:** `requisiciones:read`, `requisiciones:create`, `requisiciones:despachar`, `requisiciones:confirmar`, `requisiciones:cancel`.
- **Área solicitante** = subconjunto de `AreaProduccion`: `cocina_caliente | cocina_fria | amex | pasteleria` (nunca `cocina` legacy).

## File Structure

| Archivo                                                                               | Responsabilidad                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/shared-types/src/enums.ts`                                                  | `EstadoRequisicion`, `REQUISICION_TRANSITIONS`, `AreaSolicitante`                                               |
| `packages/shared-types/src/socket-events.ts`                                          | `CHANNELS.ALMACEN`, ACL, `RequisicionEstadoEvent`, union                                                        |
| `packages/shared-validation/src/index.ts`                                             | `areaSolicitanteSchema`, `createRequisicionSchema`, `despacharRequisicionSchema`, `transicionRequisicionSchema` |
| `supabase/migrations/20260612120000_requisiciones.sql`                                | 3 tablas + RLS + trigger append-only + índices                                                                  |
| `apps/web/src/lib/auth/permissions.ts`                                                | 5 permisos + `areaPermitidaParaRol`                                                                             |
| `apps/web/src/modules/requisiciones/domain/requisicion.ts`                            | Tipos + re-export de transiciones                                                                               |
| `apps/web/src/modules/requisiciones/application/ports/requisicion-repository.port.ts` | Puerto                                                                                                          |
| `apps/web/src/modules/requisiciones/application/*.ts`                                 | Casos de uso                                                                                                    |
| `apps/web/src/modules/requisiciones/infrastructure/requisicion-repository.ts`         | Adapter Supabase                                                                                                |
| `apps/web/src/modules/requisiciones/actions.ts`                                       | Server Actions (única superficie pública)                                                                       |
| `apps/web/src/modules/alertas/infrastructure/checks.ts`                               | `runCheckRequisicionesSinDespachar`                                                                             |
| `apps/web/src/components/requisiciones/*`                                             | Panel "Pedir insumos" (KDS) + cola (almacén)                                                                    |
| `apps/web/src/messages/{es,en}.json`                                                  | Strings i18n                                                                                                    |
| `apps/web/e2e/requisiciones.spec.ts`                                                  | E2E flujo completo                                                                                              |

---

## Task 0: Contratos en shared-types

**Files:**

- Modify: `packages/shared-types/src/enums.ts`
- Modify: `packages/shared-types/src/socket-events.ts`
- Test: `packages/shared-types/src/tests/requisiciones.test.ts` (crear)

- [ ] **Step 1: Write the failing test**

`packages/shared-types/src/tests/requisiciones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EstadoRequisicion, REQUISICION_TRANSITIONS, CHANNELS, CHANNEL_ACL } from '../index';

describe('requisiciones — contratos', () => {
  it('la máquina de estados solo permite el flujo solicitada→…→recibida', () => {
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.solicitada]).toEqual([
      'en_alistamiento',
      'cancelada',
    ]);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.en_alistamiento]).toEqual(['despachada']);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.despachada]).toEqual(['recibida']);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.recibida]).toEqual([]);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.cancelada]).toEqual([]);
  });

  it('cancelar solo es válido desde solicitada', () => {
    const cancelables = Object.entries(REQUISICION_TRANSITIONS)
      .filter(([, next]) => next.includes('cancelada'))
      .map(([estado]) => estado);
    expect(cancelables).toEqual(['solicitada']);
  });

  it('sala:almacen existe y solo la pueden unir almacén/admin/superuser', () => {
    expect(CHANNELS.ALMACEN).toBe('sala:almacen');
    expect(CHANNEL_ACL['sala:almacen']).toEqual(['personal_almacen', 'admin', 'superuser']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dorado/shared-types exec vitest run src/tests/requisiciones.test.ts`
Expected: FAIL — `EstadoRequisicion` / `CHANNELS.ALMACEN` no existen.

- [ ] **Step 3: Add enums + transitions**

En `packages/shared-types/src/enums.ts`, después del bloque `EstadoTanda`:

```typescript
export const EstadoRequisicion = {
  solicitada: 'solicitada',
  en_alistamiento: 'en_alistamiento',
  despachada: 'despachada',
  recibida: 'recibida',
  cancelada: 'cancelada',
} as const;

export type EstadoRequisicion = (typeof EstadoRequisicion)[keyof typeof EstadoRequisicion];

// Máquina de transiciones de una requisición. Cancelable solo en `solicitada`.
export const REQUISICION_TRANSITIONS: Record<EstadoRequisicion, EstadoRequisicion[]> = {
  solicitada: ['en_alistamiento', 'cancelada'],
  en_alistamiento: ['despachada'],
  despachada: ['recibida'],
  recibida: [],
  cancelada: [],
};

// Áreas que pueden originar una requisición (subconjunto de AreaProduccion —
// `cocina` legacy queda excluida).
export type AreaSolicitante = 'cocina_caliente' | 'cocina_fria' | 'amex' | 'pasteleria';

export const AREAS_SOLICITANTES: AreaSolicitante[] = [
  'cocina_caliente',
  'cocina_fria',
  'amex',
  'pasteleria',
];
```

- [ ] **Step 4: Add channel + event**

En `packages/shared-types/src/socket-events.ts`:

1. En `CHANNELS`, después de `BUFFET`:

```typescript
  ALMACEN: 'sala:almacen',
```

2. En `CHANNEL_ACL`, después de `'sala:buffet'`:

```typescript
  'sala:almacen': ['personal_almacen', 'admin', 'superuser'],
```

3. Importar el tipo en la cabecera del archivo (junto a los imports existentes):

```typescript
import type {
  UserRole,
  ZonaServicio,
  EstadoPedido,
  EstadoRequisicion,
  AreaSolicitante,
} from './enums';
```

4. Antes de `export type SocketEvent`, agregar el evento:

```typescript
export interface RequisicionEstadoEvent {
  type: 'REQUISICION_ESTADO';
  payload: {
    requisicionId: string;
    tenantId: string;
    areaSolicitante: AreaSolicitante;
    estadoAnterior: EstadoRequisicion;
    estadoNuevo: EstadoRequisicion;
    updatedAt: string;
  };
}
```

5. Agregar `RequisicionEstadoEvent` a la unión `SocketEvent`:

```typescript
export type SocketEvent =
  | PedidoCreadoEvent
  | PedidoEstadoEvent
  | ItemEstadoEvent
  | PedidoCocineroEvent
  | StockOutEvent
  | DespachoEvent
  | MensajeChatEvent
  | BroadcastEvent
  | StuartRequestEvent
  | SolicitudPreparacionEvent
  | TurnoEvent
  | AlertaEvent
  | RequisicionEstadoEvent;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dorado/shared-types exec vitest run src/tests/requisiciones.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify socket-server ACL reads from CHANNEL_ACL**

Run: `grep -n "CHANNEL_ACL\|canJoinChannel" apps/socket-server/src/lib/auth.ts`
Expected: `canJoinChannel` consume `CHANNEL_ACL` de `@dorado/shared-types`. Si es así, el canal nuevo queda cubierto sin tocar el socket-server. Si NO lee de `CHANNEL_ACL` (lista hardcodeada), añadir `'sala:almacen'` ahí y un test de ACL.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/
git commit -m "feat(shared-types): contrato de requisiciones — estados, canal sala:almacen y evento"
```

---

## Task 1: Schemas Zod en shared-validation

**Files:**

- Modify: `packages/shared-validation/src/index.ts`
- Test: `packages/shared-validation/src/tests/requisiciones.test.ts` (crear)

- [ ] **Step 1: Write the failing test**

`packages/shared-validation/src/tests/requisiciones.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createRequisicionSchema,
  despacharRequisicionSchema,
  transicionRequisicionSchema,
} from '../index';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('createRequisicionSchema', () => {
  it('acepta una requisición válida', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'cocina_caliente',
      idempotencyKey: 'req-1',
      items: [{ insumoId: UUID, cantidadSolicitada: 5, unidad: 'g' }],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza área inválida (cocina legacy)', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'cocina',
      idempotencyKey: 'req-1',
      items: [{ insumoId: UUID, cantidadSolicitada: 5, unidad: 'g' }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza requisición sin items', () => {
    const r = createRequisicionSchema.safeParse({
      areaSolicitante: 'amex',
      idempotencyKey: 'req-1',
      items: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('despacharRequisicionSchema', () => {
  it('exige version y al menos un item con cantidad despachada', () => {
    const ok = despacharRequisicionSchema.safeParse({
      requisicionId: UUID,
      version: 1,
      items: [{ itemId: UUID, cantidadDespachada: 3 }],
    });
    expect(ok.success).toBe(true);
    const bad = despacharRequisicionSchema.safeParse({
      requisicionId: UUID,
      version: 1,
      items: [],
    });
    expect(bad.success).toBe(false);
  });
});

describe('transicionRequisicionSchema', () => {
  it('exige requisicionId y version', () => {
    expect(transicionRequisicionSchema.safeParse({ requisicionId: UUID, version: 2 }).success).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dorado/shared-validation exec vitest run src/tests/requisiciones.test.ts`
Expected: FAIL — schemas no exportados.

- [ ] **Step 3: Add schemas**

Al final de `packages/shared-validation/src/index.ts`:

```typescript
// ── Requisiciones (Frente 2) ──────────────────────────────────────────────────

export const areaSolicitanteSchema = z.enum([
  'cocina_caliente',
  'cocina_fria',
  'amex',
  'pasteleria',
]);

export const createRequisicionSchema = z.object({
  areaSolicitante: areaSolicitanteSchema,
  idempotencyKey: idempotencyKeySchema,
  notas: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        insumoId: uuidSchema,
        cantidadSolicitada: cantidadSchema,
        unidad: unidadMedidaSchema,
      }),
    )
    .min(1, 'Una requisición debe tener al menos un insumo'),
});

export const despacharRequisicionSchema = z.object({
  requisicionId: uuidSchema,
  version: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: uuidSchema,
        cantidadDespachada: cantidadSchema,
      }),
    )
    .min(1, 'Debe despachar al menos un insumo'),
});

export const transicionRequisicionSchema = z.object({
  requisicionId: uuidSchema,
  version: z.number().int().positive(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dorado/shared-validation exec vitest run src/tests/requisiciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-validation/
git commit -m "feat(shared-validation): schemas de requisiciones — crear, despachar, transición"
```

---

## Task 2: Migración SQL — tablas, RLS y trigger append-only

**Files:**

- Create: `supabase/migrations/20260612120000_requisiciones.sql`

> Recordatorio: migración idempotente, `tenant_id NOT NULL`, RLS habilitada, sin `DROP COLUMN`/`DROP TABLE`. Reusa `public.prevent_mutation()` (ya existe, migración `0002`). Verificar antes la lista de tablas en `ARCHITECTURE.md §8`.

- [ ] **Step 1: Write the migration**

```sql
-- =============================================================================
-- 20260612120000_requisiciones.sql
-- Frente 2 — Requisiciones cocina → almacén (coordinación/trazabilidad).
-- NO mueve inventario: el stock solo se descuenta vía receta (Principio Rector).
-- Idempotente.
-- =============================================================================

-- ── Enum de estado ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.estado_requisicion AS ENUM (
    'solicitada', 'en_alistamiento', 'despachada', 'recibida', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Tabla: requisiciones ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisiciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  area_solicitante public.area_produccion NOT NULL,
  solicitada_por   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  turno_id         uuid REFERENCES public.turnos(id) ON DELETE SET NULL,
  estado           public.estado_requisicion NOT NULL DEFAULT 'solicitada',
  notas            text,
  version          integer NOT NULL DEFAULT 1,
  idempotency_key  text NOT NULL,
  solicitada_at    timestamptz NOT NULL DEFAULT now(),
  alistamiento_at  timestamptz,
  despachada_at    timestamptz,
  recibida_at      timestamptz,
  cancelada_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT chk_requisicion_area_solicitante
    CHECK (area_solicitante IN ('cocina_caliente', 'cocina_fria', 'amex', 'pasteleria'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_requisiciones_idempotency
  ON public.requisiciones (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_requisiciones_cola_almacen
  ON public.requisiciones (tenant_id, estado, solicitada_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requisiciones_area
  ON public.requisiciones (tenant_id, area_solicitante, solicitada_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_requisiciones_turno
  ON public.requisiciones (tenant_id, turno_id)
  WHERE turno_id IS NOT NULL;

-- ── Tabla: requisicion_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisicion_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  requisicion_id      uuid NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  insumo_id           uuid NOT NULL REFERENCES public.insumos(id),
  cantidad_solicitada numeric(12,4) NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_despachada numeric(12,4) NOT NULL DEFAULT 0 CHECK (cantidad_despachada >= 0),
  unidad              public.unidad_medida NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisicion_items_requisicion
  ON public.requisicion_items (tenant_id, requisicion_id);

-- ── Tabla: requisicion_eventos (append-only) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.requisicion_eventos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  requisicion_id uuid NOT NULL REFERENCES public.requisiciones(id) ON DELETE CASCADE,
  estado         public.estado_requisicion NOT NULL,
  actor_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requisicion_eventos_requisicion
  ON public.requisicion_eventos (requisicion_id, created_at);

DROP TRIGGER IF EXISTS requisicion_eventos_no_update ON public.requisicion_eventos;
CREATE TRIGGER requisicion_eventos_no_update
  BEFORE UPDATE ON public.requisicion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

DROP TRIGGER IF EXISTS requisicion_eventos_no_delete ON public.requisicion_eventos;
CREATE TRIGGER requisicion_eventos_no_delete
  BEFORE DELETE ON public.requisicion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mutation();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.requisiciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicion_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicion_eventos ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado del tenant.
-- MODIFY: roles operativos del tenant (chefs de área, pastelería, almacén, admin).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['requisiciones', 'requisicion_items', 'requisicion_eventos'] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "%1$s_tenant_select" ON public.%1$s;
      CREATE POLICY "%1$s_tenant_select" ON public.%1$s
        FOR SELECT TO authenticated
        USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

      DROP POLICY IF EXISTS "%1$s_tenant_modify" ON public.%1$s;
      CREATE POLICY "%1$s_tenant_modify" ON public.%1$s
        FOR ALL TO authenticated
        USING (
          tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
          AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
            'superuser', 'admin', 'chef', 'chef_cocina_fria', 'chef_cocina_caliente',
            'sous_chef', 'personal_pasteleria', 'personal_almacen'
          )
        )
        WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);
    $f$, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.requisiciones IS
  'Requisiciones cocina→almacén. Coordinación pura: no mueve inventario (Principio Rector).';
```

- [ ] **Step 2: Validar sintaxis localmente (sin aplicar)**

Run: `python3 -c "open('supabase/migrations/20260612120000_requisiciones.sql').read()" && echo OK`
Expected: `OK`. (La validación SQL real ocurre en el preview branch de Supabase al abrir el PR — **nunca** `supabase start` local.)

- [ ] **Step 3: Actualizar lista de tablas en ARCHITECTURE.md §8**

Añadir `requisiciones`, `requisicion_items`, `requisicion_eventos` a la lista de tablas existentes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260612120000_requisiciones.sql docs/
git commit -m "feat(db): tablas de requisiciones — RLS, eventos append-only, sin movimientos de inventario"
```

---

## Task 3: Permisos + guard de área

**Files:**

- Modify: `apps/web/src/lib/auth/permissions.ts`
- Test: `apps/web/src/lib/auth/permissions-requisiciones.test.ts` (crear)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, areaPermitidaParaRol } from './permissions';

describe('permisos de requisiciones', () => {
  it('despachar es exclusivo de almacén + admin', () => {
    expect(PERMISSIONS['requisiciones:despachar']).toEqual(['admin', 'personal_almacen']);
  });

  it('crear lo pueden los roles de cocina, no almacén', () => {
    expect(PERMISSIONS['requisiciones:create']).toContain('chef_cocina_caliente');
    expect(PERMISSIONS['requisiciones:create']).not.toContain('personal_almacen');
  });
});

describe('areaPermitidaParaRol', () => {
  it('un chef de caliente solo confirma requisiciones de cocina_caliente', () => {
    expect(areaPermitidaParaRol('chef_cocina_caliente', 'cocina_caliente')).toBe(true);
    expect(areaPermitidaParaRol('chef_cocina_caliente', 'cocina_fria')).toBe(false);
  });

  it('sous_chef cubre el área amex', () => {
    expect(areaPermitidaParaRol('sous_chef', 'amex')).toBe(true);
    expect(areaPermitidaParaRol('sous_chef', 'pasteleria')).toBe(false);
  });

  it('chef y admin no están atados a un área', () => {
    expect(areaPermitidaParaRol('chef', 'cocina_fria')).toBe(true);
    expect(areaPermitidaParaRol('admin', 'pasteleria')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter apps/web exec vitest run src/lib/auth/permissions-requisiciones.test.ts`
Expected: FAIL — permisos y `areaPermitidaParaRol` no existen.

- [ ] **Step 3: Add permissions + guard**

En `apps/web/src/lib/auth/permissions.ts`, dentro de `PERMISSIONS` (después de `'alertas:write'`):

```typescript
  // Requisiciones cocina → almacén (Frente 2)
  'requisiciones:read': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
    'personal_almacen',
  ],
  'requisiciones:create': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
  'requisiciones:despachar': ['admin', 'personal_almacen'],
  'requisiciones:confirmar': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
  'requisiciones:cancel': [
    'admin',
    'chef',
    'chef_cocina_fria',
    'chef_cocina_caliente',
    'sous_chef',
    'personal_pasteleria',
  ],
```

Al final del archivo (junto a `zonaPermitidaParaRol`):

```typescript
// Mapea cada rol de cocina a su área. Roles sin entrada (chef, admin) no están
// atados — pueden operar requisiciones de cualquier área. Los turnos rotan, por
// eso confirmar valida el ÁREA, no la identidad del solicitante (spec §Frente 2).
const ROLE_AREA: Partial<Record<UserRole, string>> = {
  chef_cocina_caliente: 'cocina_caliente',
  chef_cocina_fria: 'cocina_fria',
  sous_chef: 'amex',
  personal_pasteleria: 'pasteleria',
};

export function areaPermitidaParaRol(role: UserRole, area: string): boolean {
  const areaFija = ROLE_AREA[role];
  return areaFija === undefined || areaFija === area;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run src/lib/auth/permissions-requisiciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth/
git commit -m "feat(auth): permisos de requisiciones + guard de área por rol"
```

---

## Task 4: Domain layer

**Files:**

- Create: `apps/web/src/modules/requisiciones/domain/requisicion.ts`
- Test: `apps/web/src/modules/requisiciones/tests/requisicion-domain.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { REQUISICION_TRANSITIONS, puedeTransicionar } from '../domain/requisicion';

describe('requisicion domain', () => {
  it('puedeTransicionar respeta la máquina de estados', () => {
    expect(puedeTransicionar('solicitada', 'en_alistamiento')).toBe(true);
    expect(puedeTransicionar('solicitada', 'despachada')).toBe(false);
    expect(puedeTransicionar('en_alistamiento', 'despachada')).toBe(true);
    expect(puedeTransicionar('despachada', 'recibida')).toBe(true);
    expect(puedeTransicionar('recibida', 'cancelada')).toBe(false);
  });

  it('re-exporta el contrato de transiciones de shared-types', () => {
    expect(REQUISICION_TRANSITIONS.solicitada).toContain('cancelada');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/requisicion-domain.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Write the domain**

`apps/web/src/modules/requisiciones/domain/requisicion.ts`:

```typescript
import type { EstadoRequisicion, AreaSolicitante, UnidadMedida } from '@dorado/shared-types';
import { REQUISICION_TRANSITIONS } from '@dorado/shared-types';

export type { EstadoRequisicion, AreaSolicitante };
export { REQUISICION_TRANSITIONS };

export interface RequisicionItem {
  id: string;
  requisicionId: string;
  insumoId: string;
  insumoNombre: string;
  cantidadSolicitada: number;
  cantidadDespachada: number;
  unidad: UnidadMedida;
}

export interface Requisicion {
  id: string;
  tenantId: string;
  areaSolicitante: AreaSolicitante;
  solicitadaPor: string | null;
  turnoId: string | null;
  estado: EstadoRequisicion;
  notas: string | null;
  version: number;
  solicitadaAt: Date;
  alistamientoAt: Date | null;
  despachadaAt: Date | null;
  recibidaAt: Date | null;
  canceladaAt: Date | null;
  createdAt: Date;
}

export interface RequisicionWithItems extends Requisicion {
  items: RequisicionItem[];
}

export type CreateRequisicionInput = {
  areaSolicitante: AreaSolicitante;
  idempotencyKey: string;
  notas?: string | undefined;
  turnoId?: string | undefined;
  items: Array<{ insumoId: string; cantidadSolicitada: number; unidad: UnidadMedida }>;
};

export type DespachoItemInput = { itemId: string; cantidadDespachada: number };

// Regla pura: ¿es legal pasar de `desde` a `hacia`?
export function puedeTransicionar(desde: EstadoRequisicion, hacia: EstadoRequisicion): boolean {
  return REQUISICION_TRANSITIONS[desde].includes(hacia);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/requisicion-domain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/requisiciones/
git commit -m "feat(requisiciones): domain — tipos y máquina de transiciones"
```

---

## Task 5: Application — puerto y casos de uso

**Files:**

- Create: `apps/web/src/modules/requisiciones/application/ports/requisicion-repository.port.ts`
- Create: `apps/web/src/modules/requisiciones/application/create-requisicion.ts`
- Create: `apps/web/src/modules/requisiciones/application/transition-requisicion.ts`
- Test: `apps/web/src/modules/requisiciones/tests/application.test.ts`

- [ ] **Step 1: Write the port**

`application/ports/requisicion-repository.port.ts`:

```typescript
import type {
  Requisicion,
  RequisicionWithItems,
  CreateRequisicionInput,
  DespachoItemInput,
  EstadoRequisicion,
  AreaSolicitante,
} from '../../domain/requisicion';

export interface RequisicionRepository {
  create(
    tenantId: string,
    userId: string,
    input: CreateRequisicionInput,
  ): Promise<RequisicionWithItems>;
  findById(id: string, tenantId: string): Promise<RequisicionWithItems | null>;
  /** Cola del almacén: requisiciones activas (no recibidas/canceladas) del tenant. */
  findColaAlmacen(tenantId: string): Promise<RequisicionWithItems[]>;
  /** Requisiciones de un área (historial del KDS que las origina). */
  findByArea(tenantId: string, area: AreaSolicitante): Promise<RequisicionWithItems[]>;
  /** Transición de estado con optimistic locking. Registra el evento append-only. */
  transition(
    id: string,
    tenantId: string,
    actorId: string,
    estado: EstadoRequisicion,
    version: number,
  ): Promise<Requisicion>;
  /** Despacho (parcial o total): actualiza cantidades + transición a `despachada`. */
  despachar(
    id: string,
    tenantId: string,
    actorId: string,
    items: DespachoItemInput[],
    version: number,
  ): Promise<Requisicion>;
}
```

- [ ] **Step 2: Write the failing test**

`tests/application.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createRequisicion } from '../application/create-requisicion';
import { transitionRequisicion } from '../application/transition-requisicion';
import type { RequisicionRepository } from '../application/ports/requisicion-repository.port';

function repoMock(overrides: Partial<RequisicionRepository> = {}): RequisicionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findColaAlmacen: vi.fn(),
    findByArea: vi.fn(),
    transition: vi.fn(),
    despachar: vi.fn(),
    ...overrides,
  };
}

describe('createRequisicion use case', () => {
  it('delega en el repositorio con tenant y usuario', async () => {
    const repo = repoMock({
      create: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', items: [] }),
    });
    const r = await createRequisicion(repo, 't1', 'u1', {
      areaSolicitante: 'cocina_fria',
      idempotencyKey: 'k1',
      items: [{ insumoId: 'i1', cantidadSolicitada: 2, unidad: 'g' }],
    });
    expect(r.id).toBe('r1');
    expect(repo.create).toHaveBeenCalledWith(
      't1',
      'u1',
      expect.objectContaining({ areaSolicitante: 'cocina_fria' }),
    );
  });
});

describe('transitionRequisicion use case', () => {
  it('rechaza una transición ilegal antes de tocar el repo', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', version: 1 }),
    });
    await expect(transitionRequisicion(repo, 'r1', 't1', 'u1', 'despachada', 1)).rejects.toThrow(
      /transición/i,
    );
    expect(repo.transition).not.toHaveBeenCalled();
  });

  it('ejecuta una transición legal', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ id: 'r1', estado: 'solicitada', version: 1 }),
      transition: vi.fn().mockResolvedValue({ id: 'r1', estado: 'en_alistamiento', version: 2 }),
    });
    const r = await transitionRequisicion(repo, 'r1', 't1', 'u1', 'en_alistamiento', 1);
    expect(r.estado).toBe('en_alistamiento');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/application.test.ts`
Expected: FAIL — casos de uso no existen.

- [ ] **Step 4: Write the use cases**

`application/create-requisicion.ts`:

```typescript
import type { RequisicionRepository } from './ports/requisicion-repository.port';
import type { CreateRequisicionInput, RequisicionWithItems } from '../domain/requisicion';

export async function createRequisicion(
  repo: RequisicionRepository,
  tenantId: string,
  userId: string,
  input: CreateRequisicionInput,
): Promise<RequisicionWithItems> {
  return repo.create(tenantId, userId, input);
}
```

`application/transition-requisicion.ts`:

```typescript
import { AppError } from '@/lib/result';
import { puedeTransicionar } from '../domain/requisicion';
import type { RequisicionRepository } from './ports/requisicion-repository.port';
import type { EstadoRequisicion, Requisicion } from '../domain/requisicion';

export async function transitionRequisicion(
  repo: RequisicionRepository,
  id: string,
  tenantId: string,
  actorId: string,
  estadoNuevo: EstadoRequisicion,
  version: number,
): Promise<Requisicion> {
  const actual = await repo.findById(id, tenantId);
  if (!actual) {
    throw new AppError('NOT_FOUND', 404, 'Requisición no encontrada');
  }
  if (!puedeTransicionar(actual.estado, estadoNuevo)) {
    throw new AppError(
      'INVALID_TRANSITION',
      400,
      `No se puede pasar de '${actual.estado}' a '${estadoNuevo}'`,
    );
  }
  return repo.transition(id, tenantId, actorId, estadoNuevo, version);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/application.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/requisiciones/
git commit -m "feat(requisiciones): application — puerto y casos de uso con validación de transición"
```

---

## Task 6: Infrastructure — adapter Supabase

**Files:**

- Create: `apps/web/src/modules/requisiciones/infrastructure/requisicion-repository.ts`

> Patrón de referencia: `apps/web/src/modules/orders/infrastructure/order-repository.ts` (create con items hijos, transition con optimistic locking, mapeo snake_case → camelCase). El repo usa el cliente de usuario (`createClient`) salvo lecturas cross-tenant; las RLS de la Task 2 ya permiten a los roles operativos. La transición hace `.eq('version', version)` y, si afecta 0 filas, lanza `AppError('VERSION_CONFLICT', 409, …)`. Cada transición inserta en `requisicion_eventos` (persistencia primero).

- [ ] **Step 1: Implement the adapter**

`infrastructure/requisicion-repository.ts` — implementa `RequisicionRepository`. Puntos clave (mirror de `order-repository.ts`):

```typescript
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { RequisicionRepository } from '../application/ports/requisicion-repository.port';
import type {
  Requisicion,
  RequisicionWithItems,
  CreateRequisicionInput,
  DespachoItemInput,
  EstadoRequisicion,
  AreaSolicitante,
} from '../domain/requisicion';

// Columna timestamp que corresponde a cada estado (para sellar la transición).
const ESTADO_TIMESTAMP: Record<EstadoRequisicion, string | null> = {
  solicitada: 'solicitada_at',
  en_alistamiento: 'alistamiento_at',
  despachada: 'despachada_at',
  recibida: 'recibida_at',
  cancelada: 'cancelada_at',
};

export function createRequisicionRepository(): RequisicionRepository {
  return {
    async create(tenantId, userId, input) {
      const supabase = await createClient();
      const { data: req, error } = await supabase
        .from('requisiciones')
        .insert({
          tenant_id: tenantId,
          area_solicitante: input.areaSolicitante,
          solicitada_por: userId,
          turno_id: input.turnoId ?? null,
          notas: input.notas ?? null,
          idempotency_key: input.idempotencyKey,
        })
        .select('*')
        .single();
      if (error || !req)
        throw new AppError('INTERNAL_ERROR', 500, error?.message ?? 'No se pudo crear');

      const itemsPayload = input.items.map((it) => ({
        tenant_id: tenantId,
        requisicion_id: req.id,
        insumo_id: it.insumoId,
        cantidad_solicitada: it.cantidadSolicitada,
        unidad: it.unidad,
      }));
      const { error: itErr } = await supabase.from('requisicion_items').insert(itemsPayload);
      if (itErr) throw new AppError('INTERNAL_ERROR', 500, itErr.message);

      await supabase.from('requisicion_eventos').insert({
        tenant_id: tenantId,
        requisicion_id: req.id,
        estado: 'solicitada',
        actor_id: userId,
      });

      const created = await this.findById(req.id, tenantId);
      if (!created)
        throw new AppError('INTERNAL_ERROR', 500, 'Requisición no encontrada tras crear');
      return created;
    },

    async findById(id, tenantId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select('*, items:requisicion_items(*, insumo:insumos(nombre))')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();
      return data ? mapRequisicion(data) : null;
    },

    async findColaAlmacen(tenantId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select('*, items:requisicion_items(*, insumo:insumos(nombre))')
        .eq('tenant_id', tenantId)
        .in('estado', ['solicitada', 'en_alistamiento', 'despachada'])
        .is('deleted_at', null)
        .order('solicitada_at', { ascending: true });
      return (data ?? []).map(mapRequisicion);
    },

    async findByArea(tenantId, area) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select('*, items:requisicion_items(*, insumo:insumos(nombre))')
        .eq('tenant_id', tenantId)
        .eq('area_solicitante', area)
        .is('deleted_at', null)
        .order('solicitada_at', { ascending: false });
      return (data ?? []).map(mapRequisicion);
    },

    async transition(id, tenantId, actorId, estado, version) {
      const supabase = await createClient();
      const patch: Record<string, unknown> = {
        estado,
        version: version + 1,
        updated_at: new Date().toISOString(),
      };
      const tsCol = ESTADO_TIMESTAMP[estado];
      if (tsCol) patch[tsCol] = new Date().toISOString();

      const { data, error } = await supabase
        .from('requisiciones')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('version', version)
        .select('*')
        .maybeSingle();
      if (error) throw new AppError('INTERNAL_ERROR', 500, error.message);
      if (!data)
        throw new AppError(
          'VERSION_CONFLICT',
          409,
          'La requisición cambió; recarga e intenta de nuevo',
        );

      await supabase.from('requisicion_eventos').insert({
        tenant_id: tenantId,
        requisicion_id: id,
        estado,
        actor_id: actorId,
      });
      return mapRequisicionRow(data);
    },

    async despachar(id, tenantId, actorId, items, version) {
      const supabase = await createClient();
      for (const it of items) {
        const { error } = await supabase
          .from('requisicion_items')
          .update({ cantidad_despachada: it.cantidadDespachada })
          .eq('id', it.itemId)
          .eq('tenant_id', tenantId);
        if (error) throw new AppError('INTERNAL_ERROR', 500, error.message);
      }
      return this.transition(id, tenantId, actorId, 'despachada', version);
    },
  };
}

// ── mapeo snake_case → dominio ────────────────────────────────────────────────
function mapRequisicionRow(row: Record<string, unknown>): Requisicion {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    areaSolicitante: row['area_solicitante'] as AreaSolicitante,
    solicitadaPor: (row['solicitada_por'] as string | null) ?? null,
    turnoId: (row['turno_id'] as string | null) ?? null,
    estado: row['estado'] as EstadoRequisicion,
    notas: (row['notas'] as string | null) ?? null,
    version: row['version'] as number,
    solicitadaAt: new Date(row['solicitada_at'] as string),
    alistamientoAt: row['alistamiento_at'] ? new Date(row['alistamiento_at'] as string) : null,
    despachadaAt: row['despachada_at'] ? new Date(row['despachada_at'] as string) : null,
    recibidaAt: row['recibida_at'] ? new Date(row['recibida_at'] as string) : null,
    canceladaAt: row['cancelada_at'] ? new Date(row['cancelada_at'] as string) : null,
    createdAt: new Date(row['created_at'] as string),
  };
}

function mapRequisicion(row: Record<string, unknown>): RequisicionWithItems {
  const base = mapRequisicionRow(row);
  const items = ((row['items'] as Record<string, unknown>[]) ?? []).map((it) => ({
    id: it['id'] as string,
    requisicionId: it['requisicion_id'] as string,
    insumoId: it['insumo_id'] as string,
    insumoNombre: (it['insumo'] as { nombre?: string } | null)?.nombre ?? '—',
    cantidadSolicitada: Number(it['cantidad_solicitada']),
    cantidadDespachada: Number(it['cantidad_despachada']),
    unidad: it['unidad'] as RequisicionWithItems['items'][number]['unidad'],
  }));
  return { ...base, items };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter apps/web exec tsc --noEmit`
Expected: sin errores en el módulo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/modules/requisiciones/infrastructure/
git commit -m "feat(requisiciones): infrastructure — adapter Supabase con optimistic locking y eventos"
```

---

## Task 7: Server Actions

**Files:**

- Create: `apps/web/src/modules/requisiciones/actions.ts`
- Test: `apps/web/src/modules/requisiciones/tests/actions.test.ts`

> Cada action: `'use server'` + `assertCan` + Zod + `auditLog` + emit `REQUISICION_ESTADO` (persistencia primero, broadcast después). `despacharRequisicion`/`confirmarRecibido`/`cancelarRequisicion` aplican `areaPermitidaParaRol(ctx.role, requisicion.areaSolicitante)` antes de transicionar. El turno activo se resuelve por `(tenant, usuario)` con `.eq('responsable_id', ctx.userId)` (mismo fix que Frente 1).

- [ ] **Step 1: Write the failing test**

`tests/actions.test.ts` (hoisted mock de `assertCan`, `auditLog`, `emitEvent`, repo y supabase server). Casos mínimos:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCan: vi.fn(),
  auditLog: vi.fn(async () => {}),
  emitEvent: vi.fn(async () => {}),
  create: vi.fn(),
  findById: vi.fn(),
  transition: vi.fn(),
  findColaAlmacen: vi.fn(),
}));

vi.mock('@/lib/auth/assertCan', () => ({ assertCan: mocks.assertCan }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/socket/emit-event', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: 'turno-1' } }) }) }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/modules/requisiciones/infrastructure/requisicion-repository', () => ({
  createRequisicionRepository: () => ({
    create: mocks.create,
    findById: mocks.findById,
    transition: mocks.transition,
    findColaAlmacen: mocks.findColaAlmacen,
    findByArea: vi.fn(),
    despachar: vi.fn(),
  }),
}));

import {
  createRequisicion,
  confirmarRecibido,
  getColaAlmacen,
} from '@/modules/requisiciones/actions';

const CTX_CALIENTE = { tenantId: 't1', userId: 'u1', role: 'chef_cocina_caliente' };
const CTX_ALMACEN = { tenantId: 't1', userId: 'u2', role: 'personal_almacen' };

const VALID = {
  areaSolicitante: 'cocina_caliente',
  idempotencyKey: 'k1',
  items: [{ insumoId: '11111111-1111-4111-8111-111111111111', cantidadSolicitada: 2, unidad: 'g' }],
};

describe('createRequisicion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCan.mockResolvedValue(CTX_CALIENTE);
  });

  it('rechaza crear requisición de un área ajena al rol', async () => {
    const r = await createRequisicion({ ...VALID, areaSolicitante: 'cocina_fria' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('crea, audita y emite REQUISICION_ESTADO', async () => {
    mocks.create.mockResolvedValue({
      id: 'r1',
      areaSolicitante: 'cocina_caliente',
      estado: 'solicitada',
      version: 1,
      items: [],
    });
    const r = await createRequisicion(VALID);
    expect(r.ok).toBe(true);
    expect(mocks.auditLog).toHaveBeenCalled();
    expect(mocks.emitEvent).toHaveBeenCalledWith(
      't1',
      'sala:almacen',
      expect.objectContaining({ type: 'REQUISICION_ESTADO' }),
    );
  });
});

describe('confirmarRecibido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un chef de fría no puede confirmar una requisición de caliente', async () => {
    mocks.assertCan.mockResolvedValue({ tenantId: 't1', userId: 'u9', role: 'chef_cocina_fria' });
    mocks.findById.mockResolvedValue({
      id: 'r1',
      areaSolicitante: 'cocina_caliente',
      estado: 'despachada',
      version: 3,
    });
    const r = await confirmarRecibido('r1', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    expect(mocks.transition).not.toHaveBeenCalled();
  });
});

describe('getColaAlmacen', () => {
  it('lista la cola para almacén', async () => {
    mocks.assertCan.mockResolvedValue(CTX_ALMACEN);
    mocks.findColaAlmacen.mockResolvedValue([]);
    const r = await getColaAlmacen();
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/actions.test.ts`
Expected: FAIL — `actions.ts` no existe.

- [ ] **Step 3: Write the actions**

`apps/web/src/modules/requisiciones/actions.ts`:

```typescript
'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { areaPermitidaParaRol } from '@/lib/auth/permissions';
import { ok, err, toAppError, AppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createClient } from '@/lib/supabase/server';
import { createRequisicionRepository } from './infrastructure/requisicion-repository';
import { createRequisicion as createUseCase } from './application/create-requisicion';
import { transitionRequisicion as transitionUseCase } from './application/transition-requisicion';
import { createRequisicionSchema, despacharRequisicionSchema } from '@dorado/shared-validation';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type {
  Requisicion,
  RequisicionWithItems,
  AreaSolicitante,
  EstadoRequisicion,
} from './domain/requisicion';
import type { UserRole } from '@dorado/shared-types';

function guardArea(role: UserRole, area: string): AppError | null {
  if (!areaPermitidaParaRol(role, area)) {
    return new AppError('FORBIDDEN', 403, `El rol '${role}' no puede operar el área '${area}'`);
  }
  return null;
}

async function turnoActivoId(tenantId: string, userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('turnos')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('responsable_id', userId) // 1 turno activo por (tenant, usuario)
    .eq('activo', true)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

function emitEstado(
  req: { id: string; areaSolicitante: AreaSolicitante },
  tenantId: string,
  estadoAnterior: EstadoRequisicion,
  estadoNuevo: EstadoRequisicion,
): Promise<void> {
  return emitEvent(tenantId, CHANNELS.ALMACEN, {
    type: 'REQUISICION_ESTADO',
    payload: {
      requisicionId: req.id,
      tenantId,
      areaSolicitante: req.areaSolicitante,
      estadoAnterior,
      estadoNuevo,
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function createRequisicion(input: unknown): Promise<Result<RequisicionWithItems>> {
  try {
    const ctx = await assertCan('requisiciones:create');
    const parsed = createRequisicionSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        new AppError('VALIDATION', 400, parsed.error.errors[0]?.message ?? 'Datos inválidos'),
      );
    }
    const areaErr = guardArea(ctx.role, parsed.data.areaSolicitante);
    if (areaErr) return err(areaErr);

    const turnoId = (await turnoActivoId(ctx.tenantId, ctx.userId)) ?? undefined;
    const repo = createRequisicionRepository();
    const req = await createUseCase(repo, ctx.tenantId, ctx.userId, { ...parsed.data, turnoId });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'requisiciones:crear',
      resourceId: req.id,
      resourceType: 'requisicion',
      payload: { areaSolicitante: req.areaSolicitante, items: req.items.length },
    });
    await emitEstado(req, ctx.tenantId, 'solicitada', 'solicitada');
    return ok(req);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getColaAlmacen(): Promise<Result<RequisicionWithItems[]>> {
  try {
    const ctx = await assertCan('requisiciones:read');
    const repo = createRequisicionRepository();
    return ok(await repo.findColaAlmacen(ctx.tenantId));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function getRequisicionesArea(
  area: AreaSolicitante,
): Promise<Result<RequisicionWithItems[]>> {
  try {
    const ctx = await assertCan('requisiciones:read');
    const areaErr = guardArea(ctx.role, area);
    if (areaErr) return err(areaErr);
    const repo = createRequisicionRepository();
    return ok(await repo.findByArea(ctx.tenantId, area));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function alistarRequisicion(
  id: string,
  version: number,
): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:despachar', id, version, 'en_alistamiento', false);
}

export async function despacharRequisicion(input: unknown): Promise<Result<Requisicion>> {
  try {
    const ctx = await assertCan('requisiciones:despachar');
    const parsed = despacharRequisicionSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        new AppError('VALIDATION', 400, parsed.error.errors[0]?.message ?? 'Datos inválidos'),
      );
    }
    const repo = createRequisicionRepository();
    const req = await repo.findById(parsed.data.requisicionId, ctx.tenantId);
    if (!req) return err(new AppError('NOT_FOUND', 404, 'Requisición no encontrada'));

    const updated = await repo.despachar(
      req.id,
      ctx.tenantId,
      ctx.userId,
      parsed.data.items,
      parsed.data.version,
    );
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'requisiciones:despachar',
      resourceId: req.id,
      resourceType: 'requisicion',
      payload: { items: parsed.data.items.length },
    });
    await emitEstado(req, ctx.tenantId, req.estado, 'despachada');
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function confirmarRecibido(id: string, version: number): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:confirmar', id, version, 'recibida', true);
}

export async function cancelarRequisicion(
  id: string,
  version: number,
): Promise<Result<Requisicion>> {
  return transicionar('requisiciones:cancel', id, version, 'cancelada', true);
}

// Helper común para las transiciones simples (alistar/recibir/cancelar).
// `guardByArea`: si true, valida que el área de la requisición corresponda al rol.
async function transicionar(
  permiso: string,
  id: string,
  version: number,
  estadoNuevo: EstadoRequisicion,
  guardByArea: boolean,
): Promise<Result<Requisicion>> {
  try {
    const ctx = await assertCan(permiso);
    const repo = createRequisicionRepository();
    const req = await repo.findById(id, ctx.tenantId);
    if (!req) return err(new AppError('NOT_FOUND', 404, 'Requisición no encontrada'));
    if (guardByArea) {
      const areaErr = guardArea(ctx.role, req.areaSolicitante);
      if (areaErr) return err(areaErr);
    }
    const updated = await transitionUseCase(
      repo,
      id,
      ctx.tenantId,
      ctx.userId,
      estadoNuevo,
      version,
    );
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: `requisiciones:${estadoNuevo}`,
      resourceId: id,
      resourceType: 'requisicion',
      payload: {},
    });
    await emitEstado(req, ctx.tenantId, req.estado, estadoNuevo);
    return ok(updated);
  } catch (e) {
    return err(toAppError(e));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter apps/web exec vitest run src/modules/requisiciones/tests/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run /check-arch (sanity de capas + actions completas)**

Run: `grep -L "assertCan\|auditLog" apps/web/src/modules/requisiciones/actions.ts`
Expected: vacío (todas las superficies tienen assertCan + auditLog).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/requisiciones/
git commit -m "feat(requisiciones): server actions — crear, despachar, transiciones con guard de área y broadcast"
```

---

## Task 8: Alertas — requisición sin despachar > umbral

**Files:**

- Modify: `apps/web/src/modules/alertas/domain/alerta.ts`
- Modify: `apps/web/src/modules/alertas/infrastructure/checks.ts`
- Modify: `apps/web/src/app/api/cron/check-alertas/route.ts`
- Modify: `packages/shared-types/src/socket-events.ts` (tipo de `AlertaEvent.tipo`)
- Test: `apps/web/src/modules/alertas/tests/check-requisiciones.test.ts`

> Antes: verificar si `public.alertas.tipo` tiene CHECK constraint que enumere los tipos. Run: `grep -rn "tipo.*CHECK\|chk_alertas_tipo\|alertas.*tipo" supabase/migrations/*alertas*.sql`. Si existe, añadir `'requisicion_demora'` con una migración idempotente `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …` (numerada `20260612120001_alerta_tipo_requisicion.sql`). Si `tipo` es texto libre, no hace falta migración.

- [ ] **Step 1: Extend the alert type (domain + contrato)**

En `apps/web/src/modules/alertas/domain/alerta.ts`, ampliar `TipoAlerta`:

```typescript
export type TipoAlerta =
  | 'stock_minimo'
  | 'vencimiento'
  | 'cambio_precio'
  | 'demora_amex'
  | 'requisicion_demora';
```

En `packages/shared-types/src/socket-events.ts`, ampliar el literal de `AlertaEvent.payload.tipo` con `'requisicion_demora'` y `resourceTipo` con `'requisicion'`.

- [ ] **Step 2: Write the failing test**

`tests/check-requisiciones.test.ts`: mockear `createAdminClient` para devolver 1 requisición en `solicitada` con `solicitada_at` viejo y sin alerta previa; afirmar que `runCheckRequisicionesSinDespachar` retorna `1` y llama a `crearAlerta` con `tipo: 'requisicion_demora'`. (Mirror de `check-deduplication.test.ts`.)

- [ ] **Step 3: Implement the check**

En `checks.ts`, junto a `runCheckDemoraAmex`:

```typescript
export async function runCheckRequisicionesSinDespachar(
  tenantId: string,
  umbralMins = 20,
): Promise<number> {
  const admin = createAdminClient();
  const umbral = new Date(Date.now() - umbralMins * 60 * 1000).toISOString();

  const { data: reqs } = await admin
    .from('requisiciones')
    .select('id, area_solicitante, solicitada_at')
    .eq('tenant_id', tenantId)
    .in('estado', ['solicitada', 'en_alistamiento'])
    .is('deleted_at', null)
    .lt('solicitada_at', umbral);

  if (!reqs || reqs.length === 0) return 0;

  const hace4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: previas } = await admin
    .from('alertas')
    .select('resource_id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'requisicion_demora')
    .eq('leida', false)
    .gte('created_at', hace4h)
    .in(
      'resource_id',
      reqs.map((r) => r.id),
    );
  const yaNotificadas = new Set(previas?.map((a) => a.resource_id) ?? []);

  let generadas = 0;
  for (const r of reqs) {
    if (yaNotificadas.has(r.id)) continue;
    await crearAlerta(tenantId, {
      tipo: 'requisicion_demora',
      severidad: 'warning',
      titulo: `Requisición sin despachar: ${r.area_solicitante}`,
      mensaje: `Una requisición de ${r.area_solicitante} lleva más de ${umbralMins} min sin despacharse.`,
      resourceId: r.id,
      resourceTipo: 'requisicion',
    });
    generadas++;
  }
  return generadas;
}
```

> Nota: si `ResourceTipoAlerta` no incluye `'requisicion'`, ampliarlo en `domain/alerta.ts` también.

- [ ] **Step 4: Wire into cron**

En `route.ts`, importar y ejecutar `runCheckRequisicionesSinDespachar` junto a los otros checks dentro del `Promise.all` por tenant; sumar el total a la respuesta.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter apps/web exec vitest run src/modules/alertas/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/alertas/ apps/web/src/app/api/cron/ packages/shared-types/
git commit -m "feat(alertas): demora de requisición sin despachar — check programado vía cron"
```

---

## Task 9: UI — panel "Pedir insumos" (KDS) + cola (almacén)

**Files:**

- Create: `apps/web/src/components/requisiciones/pedir-insumos-dialog.tsx`
- Create: `apps/web/src/components/requisiciones/cola-requisiciones.tsx`
- Modify: páginas KDS (`cocina-caliente`, `cocina-fria`, `cocina-amex`, `pasteleria`) para montar el botón "Pedir insumos"
- Modify: `apps/web/src/app/(dashboard)/almacen/page.tsx` para montar la cola
- Modify: `apps/web/src/messages/es.json`, `apps/web/src/messages/en.json`

> Patrones de referencia: `components/zonas/create-pedido-zona-dialog.tsx` (form con catálogo + cantidades, Server Action, manejo de error) y `components/zonas/zona-view.tsx` (lista en tiempo real con `use-realtime`). Strings **siempre** vía `useTranslations` — nada hardcodeado.

- [ ] **Step 1: `pedir-insumos-dialog.tsx`** — formulario que lista insumos `capa_1` del tenant (vía `getInsumos`), permite elegir cantidades y llama `createRequisicion`. El `areaSolicitante` se infiere de la ruta del KDS (prop). Muestra error con `<Alert variant="destructive">` igual que Frente 1.

- [ ] **Step 2: `cola-requisiciones.tsx`** — para `/almacen`: lista la cola (`getColaAlmacen`), con acciones "Alistar" (`alistarRequisicion`) y "Despachar" (`despacharRequisicion`, con inputs de cantidad por ítem). Suscripción en tiempo real al canal `sala:almacen` para refrescar. Para el KDS: muestra el estado de sus requisiciones y el botón "Confirmar recibido" (`confirmarRecibido`).

- [ ] **Step 3: Añadir claves i18n** en `es.json` y `en.json` bajo `requisiciones.*` (título, estados, botones, validaciones). Verificar paridad de claves entre ambos archivos.

- [ ] **Step 4: Montar en las páginas** — botón "Pedir insumos" en cada KDS (prop `area` correspondiente) y `<ColaRequisiciones>` en `/almacen`.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter apps/web exec tsc --noEmit && pnpm lint`
Expected: limpio.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/requisiciones/ apps/web/src/app/ apps/web/src/messages/
git commit -m "feat(requisiciones): UI — pedir insumos desde KDS y cola en almacén, tiempo real"
```

---

## Task 10: E2E Playwright — flujo completo

**Files:**

- Create: `apps/web/e2e/requisiciones.spec.ts`

> Patrón: `apps/web/e2e/zonas.spec.ts`. Usa `test.skip(!process.env['E2E_ADMIN_EMAIL'], …)` para correr solo con credenciales presentes; sin credenciales, lanza error en vez de pasar en vacío.

- [ ] **Step 1: Write the E2E**

Flujo: (1) login como chef de caliente → "Pedir insumos" → crear requisición. (2) login como almacén → ver la requisición en la cola → "Alistar" → "Despachar". (3) login como chef de caliente → "Confirmar recibido" → estado final `recibida`. Aserciones por texto/estado visible en cada paso.

- [ ] **Step 2: Run (si hay credenciales E2E)**

Run: `pnpm --filter apps/web test:e2e -- requisiciones.spec.ts`
Expected: PASS (o skip documentado si no hay secrets).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/requisiciones.spec.ts
git commit -m "test(requisiciones): e2e del flujo completo cocina→almacén→recibida"
```

---

## Task 11: Verificación final + PR

- [ ] **Step 1: Suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: todo verde; cobertura del dominio de `requisiciones` ≥ 90%.

- [ ] **Step 2: /check-arch**

Verificar las 5 reglas (capas, surface pública, actions completas, no-FEFO en TS, tipos en shared-types). El módulo `requisiciones` no debe importar `infrastructure/` desde `domain/` ni `application/`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feature/requisiciones
gh pr create --title "feat: Frente 2 — requisiciones cocina → almacén" --body "$(cat <<'EOF'
## Frente 2 del cierre operacional

Módulo hexagonal `requisiciones`: coordinación cocina→almacén **sin movimientos de inventario** (Principio Rector). Estados `solicitada → en_alistamiento → despachada → recibida`, cancelable solo en `solicitada`, con optimistic locking y eventos append-only.

- Contratos en shared-types (canal `sala:almacen`, evento `REQUISICION_ESTADO`).
- 3 tablas con RLS + trigger de inmutabilidad en eventos.
- Server Actions con `assertCan` + Zod + `auditLog` + guard de área por rol.
- Alertas de demora vía el cron existente.
- UI: "Pedir insumos" en cada KDS + cola en `/almacen`, tiempo real.

Spec: `docs/superpowers/specs/2026-06-11-cierre-operacional-design.md` §Frente 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Code review**

Dispatch reviewer vía `superpowers:requesting-code-review`. Atender Critical/Important antes del merge.

- [ ] **Step 5: Esperar CI verde (incl. Supabase Preview) y mergear.** Post-merge: el catálogo de insumos ya existe; no requiere `reset:test-users`.

---

## Self-review (cobertura de la spec)

| Requisito de la spec                                           | Task                                         |
| -------------------------------------------------------------- | -------------------------------------------- |
| Módulo hexagonal `requisiciones`                               | 4, 5, 6, 7                                   |
| Tablas `requisiciones`/`items`/`eventos` con RLS + append-only | 2                                            |
| Cero movimientos de inventario                                 | 2 (sin FK a lotes/movimientos), 7 (sin FEFO) |
| Estados + cancelable solo en `solicitada`                      | 0, 4                                         |
| Optimistic locking                                             | 6, 7                                         |
| Despacho parcial (`cantidad_despachada`)                       | 1, 2, 6, 7                                   |
| Evento `REQUISICION_ESTADO` + canal `sala:almacen` + ACL       | 0, 7, 8                                      |
| Permisos create/despachar/confirmar + guard de área            | 3, 7                                         |
| Confirmar por área (no por identidad)                          | 3, 7                                         |
| Alertas de demora vía cron                                     | 8                                            |
| UI KDS + almacén                                               | 9                                            |
| Tests unit/integration/E2E                                     | 0–8 (unit/integration), 10 (E2E)             |

**Riesgo abierto a vigilar:** la constraint de `alertas.tipo` (Task 8 Step 0) — confirmar si requiere migración antes de codear el check.
