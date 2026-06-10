# Operación Cerberus — Informe de Pentesting (AGENTE 03)

**Proyecto:** Dorado Lounge — SaaS multi-tenant 24/7
**Rama auditada:** `feature/refoco-operacional` (delta vs `main`)
**Alcance:** vulnerabilidades NUEVAS introducidas por el refoco operacional (módulos `orders` ruteo/asignación, `inventory createLote`/merma recepción, `cocina-amex`, nuevas migraciones y RPCs, ACL Socket.io). NO se re-reportan los 42 hallazgos ya resueltos por la auditoría enterprise previa.
**Fecha:** 2026-05-30
**Método:** lectura de código + grep + `git log/diff` + Supabase MCP (solo lectura: `get_advisors`, `execute_sql` de inspección).

---

## Resumen ejecutivo

El refoco introdujo **una regresión crítica de aislamiento de tenant** (BOLA) en la RPC `fn_costo_receta`, que está latente en una migración aún NO desplegada pero que **revertirá silenciosamente** un fix enterprise (C-15/costos_tenant_guard) en el próximo `supabase db push`. Además hay un hueco de integridad cross-tenant medio en la asignación de cocinero y varias observaciones de defensa en profundidad. El resto de las superficies nuevas (Server Actions de orders, `createLote`, ACL de canales, uso de service_role) mantienen el patrón seguro `assertCan + Zod + auditLog` y el filtrado por `tenant_id`/RLS.

**Score de Seguridad: 72 / 100** (justificación al final).

---

## Hallazgos

### H-01 · CRÍTICO — Regresión de aislamiento de tenant en `fn_costo_receta` (BOLA / cross-tenant read)

- **CWE-639** (Authorization Bypass Through User-Controlled Key) · **OWASP API1:2023 BOLA** · **OWASP A01:2021**.
- **Estado:** HECHO (verificado). Latente: la migración del delta aún NO está aplicada en producción (último migration aplicado en DB: `20260526200000`; la DB viva todavía conserva el guard). Se activará al desplegar la rama.

**Evidencia:**

`supabase/migrations/20260530000002_costo_receta_sin_merma.sql:14-32` recrea la función con `CREATE OR REPLACE` y **elimina la validación de tenant del caller** que había añadido el fix enterprise:

```sql
-- 20260530000002 (NUEVA — rama refoco): NO valida al caller
CREATE OR REPLACE FUNCTION public.fn_costo_receta(p_tenant_id uuid, p_receta_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ...
BEGIN
  SELECT porciones INTO v_porciones      -- ← entra directo, sin chequear caller
  FROM public.recetas
  WHERE id = p_receta_id AND tenant_id = p_tenant_id ...
```

Comparar con el fix enterprise que esta migración pisa — `supabase/migrations/20260515000004_costos_tenant_guard.sql:26-32`:

```sql
  v_caller_tenant := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
  IF v_caller_tenant IS NULL OR v_caller_tenant != p_tenant_id THEN
    RETURN jsonb_build_object('error', 'Acceso no autorizado');
  END IF;
```

La función es `SECURITY DEFINER` y, según Supabase advisor (`0028`/`0029`), es ejecutable por `anon` y `authenticated` vía `/rest/v1/rpc/fn_costo_receta`. La nueva versión confía ciegamente en el parámetro `p_tenant_id` provisto por el cliente.

Verificación en DB viva (la migración aún no aplicada conserva el guard):

```
fn_costo_receta → has_jwt_check=true, has_caller_check=true   (estado ACTUAL en prod)
schema_migrations max = 20260526200000  (el delta no está desplegado)
```

**PoC conceptual** (tras desplegar la rama): cualquier usuario autenticado de Tenant A obtiene costos, recetas, ingredientes y precios de lote FEFO de Tenant B:

```
POST /rest/v1/rpc/fn_costo_receta
Authorization: Bearer <jwt-tenant-A>
{ "p_tenant_id": "<uuid-tenant-B>", "p_receta_id": "<receta-de-B>" }
→ 200 { costo_total, ingredientes:[{insumo_nombre, precio_unitario,...}] }
```

- **Impacto:** Fuga de inteligencia comercial entre tenants (estructura de costos, proveedores implícitos vía precio, recetas). Viola multi-tenancy, principio rector del producto.
- **Probabilidad:** ALTA una vez desplegado — endpoint REST autogenerado, sin gating de app, parámetro controlado por el cliente.
- **Solución:** Re-incorporar el bloque `v_caller_tenant := (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid; IF v_caller_tenant IS NULL OR v_caller_tenant != p_tenant_id THEN RETURN ... 'Acceso no autorizado'; END IF;` al inicio de la función en `20260530000002`. Idealmente añadir un test de migración/regresión que falle si el `pg_get_functiondef` no contiene `auth.jwt`. Considerar también derivar `p_tenant_id` del JWT en vez de recibirlo como parámetro.

---

### H-02 · MEDIO — `asignarCocinero` no valida que el cocinero pertenezca al tenant (BOLA-write / integridad cross-tenant)

- **CWE-639 / CWE-602** · **OWASP API1:2023 BOLA**.
- **Estado:** HECHO (verificado).

**Evidencia:**

`apps/web/src/modules/orders/actions.ts:281-307` — la acción solo valida `cocineroId` no vacío y persiste el valor crudo del cliente:

```ts
export async function asignarCocinero(pedidoId, cocineroId, version) {
  const ctx = await assertCan('orders:dispatch');
  if (!cocineroId) return err(... 'Debe indicar el cocinero a asignar');
  // ...no se verifica que cocineroId sea un user del tenant ctx.tenantId
  const updated = await repo.asignarCocinero(pedidoId, ctx.tenantId, cocineroId, version);
```

`apps/web/src/modules/orders/infrastructure/order-repository.ts:334-343` escribe `cocinero_id: cocineroId` sin join a `users`/`tenant_id`.

La columna se definió como FK a `auth.users(id)` **global**, sin guard de tenant — `supabase/migrations/20260528000002_pedido_trazabilidad.sql:24-25`:

```sql
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cocinero_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
```

No existe trigger de validación cocinero↔tenant (grep en `supabase/migrations/` no halla `fn_validate*cocinero`).

- **Impacto:** Un usuario con `orders:dispatch` (admin/chef/sous*chef/chef_cocina*\*) puede asignar como cocinero el UUID de un usuario de OTRO tenant. Esto contamina la trazabilidad del pedido y permite confirmar por oráculo la existencia de UUIDs de usuarios ajenos. La FK a `auth.users` impide inyectar UUIDs inexistentes, lo que limita el alcance.
- **Probabilidad:** BAJA-MEDIA (rol privilegiado de cocina; requiere conocer/enumerar un UUID válido). Aún no hay UI que lo invoque, pero la Server Action es alcanzable directamente.
- **Solución:** En `asignarCocinero` validar que `cocineroId` exista en `public.users` con `tenant_id = ctx.tenantId` (y rol de cocina) antes de persistir; o añadir trigger `fn_validate_pedido_cocinero_tenant` análogo a `fn_validate_receta_ingrediente_tenant`. Preferir validación en Postgres (consistente con "multi-tenancy se enforza en Postgres").

---

### H-03 · BAJO — Lecturas de `users` con admin client sin filtro de `tenant_id` (defensa en profundidad)

- **CWE-1220** (Insufficient Granularity of Access Control).
- **Estado:** HECHO (no explotable hoy; el conjunto de IDs ya viene acotado por tenant).

**Evidencia:**

- `apps/web/src/modules/orders/actions.ts:533` — `admin.from('users').select('id, nombre').in('id', actorIds)`
- `apps/web/src/modules/cocina-amex/infrastructure/cocina-amex-repository.ts:172` — idéntico patrón.

En ambos casos `actorIds` se deriva de `pedido_eventos` ya filtrado por `tenant_id`, por lo que no hay fuga real. Pero al usar el admin client (RLS bypass) sin `.eq('tenant_id', ctx.tenantId)`, cualquier futuro cambio que afloje el origen de `actorIds` abriría una fuga de nombres cross-tenant.

- **Impacto:** Nulo hoy; riesgo de regresión futura.
- **Probabilidad:** BAJA.
- **Solución:** Añadir `.eq('tenant_id', ctx.tenantId)` a ambas consultas como invariante defensivo.

---

### H-04 · BAJO — `getCartaServicio` expone platos inactivos a `mesero_amex` vía admin client

- **CWE-200** (Exposure of Sensitive Information) — informativo.
- **Estado:** HECHO (decisión de negocio; documentar).

**Evidencia:** `apps/web/src/modules/orders/actions.ts:30-44` — usa `createAdminClient()` y selecciona recetas **incluyendo `activo = false`** (comentario "incluye inactivas para toggle"), con permiso `recipes:read` que incluye a `mesero_amex`. El filtrado por `tenant_id` SÍ está presente (`.eq('tenant_id', ctx.tenantId)`), así que no hay fuga cross-tenant. El mesero recibe platos deshabilitados que la UI debe ocultar.

- **Impacto:** Bajo — solo metadata de platos del propio tenant.
- **Probabilidad:** BAJA.
- **Solución:** Si meseros no deben ver inactivos, filtrar `activo` por rol, o exponer un endpoint distinto para el toggle de admin.

---

## Verificaciones que PASARON (controles previos siguen vigentes)

- **`fn_descontar_insumo_fefo`** — sigue correctamente restringida: `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE ... TO service_role` (`20260503132430_0008_rpcs.sql:182-183`, reforzado en `20260505000000_security_hardening.sql`). NO es ejecutable por `authenticated`/`anon`. Solo se invoca desde el admin client server-side (`inventory/actions.ts`, `orders/actions.ts entregarPedido`). El descuento sigue 100% en SQL con `idempotency_key`. Sin regresión.
- **`SUPABASE_SERVICE_ROLE_KEY`** — solo se referencia en `lib/supabase/admin.ts:9` (y `feature-flag-repository` la usa vía ese cliente). Ningún `NEXT_PUBLIC_*` la expone. Limpio.
- **Patrón Server Actions del delta** — `createPedido`, `recibir/iniciar/despachar/entregar/cancelarPedido`, `createLote`, `createInsumosBulk`, `stockOut`, `registrarMerma`, `toggleDisponibilidadPlato` aplican todos `assertCan(perm)` + Zod `safeParse` + `auditLog` + filtrado por `ctx.tenantId`. Optimistic locking (`.eq('version', version)`) intacto en `transition`/`asignarCocinero`.
- **`createLote`** — la lectura de `insumos.merma_default` filtra por `tenant_id` (`inventory/actions.ts:316-317`); el insert de `movimientos_inventario` y el lote van scoped al tenant. Sin IDOR.
- **`createPedido` ruteo** — `findRecetaAreas` y `findByIdForDelivery` filtran por `tenant_id`; el ruteo zona→área (`routing.ts`) es puro y rechaza áreas no permitidas / recetas sin área (fail-closed). Sin SSRF/inyección.
- **ACL Socket.io** — `CHANNEL_ACL` en `packages/shared-types/src/socket-events.ts:23-49` cubre los nuevos canales `sala:cocina:fria` y `sala:cocina:caliente` con roles correctos; el evento nuevo `PEDIDO_COCINERO` no abre canal nuevo. Topología consistente.
- **Cron** — `apps/web/src/app/api/cron/flights-snapshot/route.ts` fue **eliminado** por el refoco (módulo vuelos removido); el patrón `Bearer ${CRON_SECRET}` + rate-limit que tenía era correcto. `api/cron/check-alertas` no fue modificado por el delta.
- **Sin secretos hardcoded en el delta** — la migración `20260530000003_catalogo_real_dorado.sql` solo contiene un `tenant_id` real (identificador, no secreto) y datos de catálogo. Los scripts `reset/seed-test-users.mjs` usan passwords de TEST (`Admin123`/`Dorado2026!`) leyendo `SERVICE_ROLE_KEY` de env — pre-existentes y marcados "cambiar en producción"; no son delta.

## Hallazgos de advisor (contexto, pre-existentes — NO delta del refoco)

`get_advisors(security)` reporta ítems heredados que conviene atender pero que NO introdujo el refoco: `operaciones_idempotentes` y `tenant_codigo_counters` con RLS sin policy (deny-all efectivo, aceptable), varias SECURITY DEFINER ejecutables por `authenticated`/`anon` (`fn_siguiente_codigo_*`, `refresh_ocupacion_diaria*`, `fn_purgar_*` ya con REVOKE), materialized views `mv_*` selectables (mitigadas por las vistas `_tenant`), y `auth_leaked_password_protection` desactivado. **`fn_costo_receta` aparece aquí también** y se eleva a CRÍTICO por H-01 (la versión del delta elimina el guard).

---

## Score de Seguridad: 72 / 100

**Justificación:**

- Base sólida: el delta mantiene el patrón `assertCan + Zod + auditLog`, filtrado por tenant en lecturas, descuento FEFO server-side restringido a service_role, service_role no expuesta, ACL Socket.io consistente. (+)
- **−20** por H-01: regresión CRÍTICA de aislamiento de tenant en `fn_costo_receta`, lista para desplegar y revertir un fix enterprise (impacto directo al principio multi-tenant; sería −30 si ya estuviera en producción, pero es latente).
- **−5** por H-02: hueco de integridad cross-tenant en `asignarCocinero` sin validación de pertenencia.
- **−3** por H-03/H-04: deuda de defensa en profundidad (admin client sin filtro de tenant; exposición de inactivos).

Subir a ≥90 requiere: corregir H-01 antes de cualquier deploy, cerrar H-02 con validación/trigger, y aplicar los filtros defensivos de H-03.
