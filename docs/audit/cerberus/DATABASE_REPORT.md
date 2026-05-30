# Operación Cerberus — AGENTE 04: Informe de Base de Datos

Proyecto: Dorado Lounge (Supabase Postgres, project_id `gyewxgtuzjbxzcvcfmwy`).
Rama: `feature/refoco-operacional`. Fecha: 2026-05-30.
Método: lectura estática de las 55 migraciones + repositorios `infrastructure/*.ts` + catálogo Postgres en vivo (solo SELECT/EXPLAIN) + advisors de Supabase (SECURITY y PERFORMANCE). **Solo lectura.**

---

## 0. Hecho crítico de contexto (afecta todo lo demás)

**HECHO:** El `schema_migrations` remoto se detiene en `20260526200000` (verificado con `list_migrations`). Las 7 migraciones del refoco + las 4 del enterprise audit **NO están aplicadas en prod**:

```
20260527000000..03  (enterprise audit, retention, atomic tanda, cron vault)
20260528000000      (remove vuelos/afluencia/snack/buffet)
20260528000001      (split área cocina_caliente/cocina_fria)
20260528000002      (pedido trazabilidad: prioridad, cocinero_id, area)
20260530000000..03  (unidades g/ml, merma recepción, costo sin merma, catálogo real)
```

**IMPACTO:** Los advisors corren contra el esquema VIEJO. Las tablas `pasajeros_ingreso`, `afluencia_ingresos`, `vuelos_snapshots`, `aircraft_capacity`, `buffet_tickets_turno` (que el refoco elimina) **siguen vivas en prod**, con sus índices, FKs y políticas. Muchos hallazgos del advisor desaparecen al aplicar `20260528000000`. El score se evalúa sobre el estado OBJETIVO post-refoco (lo que CI va a aplicar), señalando dónde la migración no alcanza.

---

## 1. Hallazgos

### CRÍTICO

#### DB-C1 · `pedidos.cocinero_id` referencia `auth.users(id)` (inconsistencia + ruptura de aislamiento por tenant)

- **Evidencia:** `supabase/migrations/20260528000002_pedido_trazabilidad.sql:25`
  `ADD COLUMN IF NOT EXISTS cocinero_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;`
  Contraste: el resto del esquema referencia `public.users`: `pedidos_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES users(id)` (verificado en `pg_constraint`).
- **Impacto:** (1) Inconsistencia de modelo: `responsable_id`→`public.users`, `cocinero_id`→`auth.users`. (2) `auth.users` no tiene `tenant_id`: un admin puede asignar como cocinero a un usuario de OTRO tenant (no hay validación de tenant en la FK ni trigger). (3) Las lecturas join contra `public.users` para el nombre del cocinero fallarán o devolverán vacío. Viola la convención "multi-tenancy enforzada en Postgres".
- **Probabilidad:** Alta (la columna se escribe en `asignarCocinero`, `order-repository.ts:343`).
- **Solución:** Cambiar a `REFERENCES public.users(id)` y añadir validación de tenant (trigger `fn_validate_*_tenant` como en `recetas`/`tandas`, que hoy NO existe para pedidos — ver DB-A3).

#### DB-C2 · Creación de pedido NO atómica → pedidos huérfanos sin ítems

- **Evidencia:** `apps/web/src/modules/orders/infrastructure/order-repository.ts:229-270`. Dos `INSERT` independientes vía PostgREST: primero `pedidos` (`:229`), luego `pedido_items` (`:254`). No hay RPC ni transacción que los envuelva.
- **Impacto:** Si el insert de ítems falla (validación, red, RLS), queda un `pedido` persistido sin ítems. Aparece en las colas KDS (`findActive` filtra por estado, no por existencia de ítems) y rompe el principio "todo pedido tiene ítems ruteados". El descuento FEFO al entregar no tendrá ingredientes que descontar. Contradice el patrón del proyecto que sí usa RPC atómica para tandas (`20260527000002_atomic_completar_tanda.sql`).
- **Probabilidad:** Media (ventana de error entre dos llamadas de red).
- **Solución:** Envolver creación pedido+ítems en una RPC `SECURITY DEFINER` (patrón ya usado en el repo), o al menos compensar borrando el pedido si el insert de ítems falla.

---

### ALTO

#### DB-A1 · Recetas legadas `area_produccion = 'cocina'` quedan irruteables (gap de migración de datos)

- **Evidencia:** `20260528000001_area_produccion_split.sql:8-9` añade `cocina_caliente`/`cocina_fria` pero deja `cocina` inerte y declara "las recetas previas etiquetadas como 'cocina' se reclasifican **manualmente**". La matriz `ZONA_AREAS_PERMITIDAS` (`packages/shared-types/src/enums.ts:85-88`) **no incluye** `'cocina'`. El ruteo (`orders/domain/routing.ts:45`) marca como `areasNoPermitidas` toda área no listada.
- **Impacto:** Cualquier receta aún en `'cocina'` hace que el pedido sea rechazado por la capa de aplicación (item ruteado a área que ninguna zona puede solicitar). Para el tenant real es mitigado porque `20260530000003:142-145` soft-borra TODAS las recetas; pero en un diseño multi-tenant (cualquier otra sala) las recetas `cocina` quedan rotas sin paso de datos automatizado.
- **Probabilidad:** Alta en multi-tenant; baja en el único tenant actual.
- **Solución:** Añadir `UPDATE recetas SET area_produccion='cocina_caliente' WHERE area_produccion='cocina'` (o regla de negocio) en la migración, o documentar el procedimiento manual como bloqueante pre-deploy.

#### DB-A2 · `pedido_items.area_produccion` sin validación de tenant ni FK que garantice coherencia con la receta

- **Evidencia:** `20260528000002:27-28` añade la columna como enum libre. El valor lo calcula la app (`order-repository.ts:263`, `itemAreas[item.recetaId]`). No hay trigger que verifique que el área coincide con `recetas.area_produccion` del mismo tenant. `pedido_items` no tiene NINGÚN trigger (verificado en `pg_trigger`).
- **Impacto:** El área del ítem puede divergir de la receta (la app es la única garantía). Una escritura directa o un bug de ruteo deja ítems en un KDS equivocado sin que la DB lo impida. Inconsistente con el patrón `fn_validate_receta_ingrediente_tenant` / `fn_validate_tanda_tenant` que sí blindan otras tablas.
- **Probabilidad:** Media.
- **Solución:** Trigger de validación de tenant + coherencia área↔receta en `pedido_items` (BEFORE INSERT/UPDATE).

#### DB-A3 · `pedido_items` y `pedido_eventos` sin trigger de aislamiento de tenant (deuda pre-refoco que el refoco amplía)

- **Evidencia:** `pg_trigger` no devuelve triggers para `pedido_items` ni `pedido_eventos`. `pedido_items_receta_id_fkey` referencia `recetas(id)` sin cláusula de tenant. El refoco agrega `area_produccion` y `cocinero_id` sin cerrar esta brecha.
- **Impacto:** Un `receta_id` de otro tenant podría insertarse en `pedido_items` (la FK no valida tenant); RLS protege SELECT pero la integridad referencial cross-tenant en INSERT depende solo de la app.
- **Probabilidad:** Baja-Media (RLS de pedidos mitiga, pero no la FK de receta).
- **Solución:** Triggers `fn_validate_*_tenant` para ambas tablas.

#### DB-A4 · `unindexed_foreign_keys` relevantes para el flujo operacional vivo (24 FKs sin índice de cobertura)

- **Evidencia:** PERFORMANCE advisor. Las que importan post-refoco: `lotes_insumo_id_fkey`, `receta_ingredientes_insumo_id_fkey`, `movimientos_inventario_insumo_id_fkey`, `mermas_insumo_id_fkey`, `recetas_insumo_destino_id_fkey`, `pedidos_responsable_id_fkey`, `fk_pedidos_turno`, `pedido_eventos_actor_id_fkey`, `tandas_produccion_responsable_id_fkey`, `fk_*_turno` (despachos/mermas/mov_inv/tandas).
- **Impacto:** El advisor reporta `lotes_insumo_id_fkey` sin índice, PERO en vivo existe `idx_lotes_tenant_insumo (tenant_id, insumo_id)` y `idx_lotes_fefo` — el join por `insumo_id` solo no usa el compuesto si no filtra tenant. `receta_ingredientes_insumo_id_fkey` SÍ carece de índice por `insumo_id` (la migración de merma F3 hace `JOIN receta_ingredientes ON insumo_id` — seq scan). FKs sin índice penalizan `ON DELETE` y joins por la columna sola.
- **Probabilidad:** Media (volumen bajo hoy; crece con histórico 24/7).
- **Solución:** Índices puntuales en `receta_ingredientes(insumo_id)`, `movimientos_inventario(insumo_id)`, `pedido_eventos(actor_id)` y los `*_turno` realmente consultados. Evitar índice por cada FK (varios ya cubiertos por compuestos `(tenant_id, x)`).

---

### MEDIO

#### DB-M1 · `lotes.cantidad_inicial > 0` (estricto) puede romperse al netear merma

- **Evidencia:** Constraint `lotes_cantidad_inicial_check CHECK (cantidad_inicial > 0)`. Migración `20260530000001_merma_recepcion.sql:34` hace `round(cantidad_inicial * (1 - coef), 4)`.
- **Impacto:** Para lotes muy pequeños con merma alta, el `round(...,4)` podría dar `0` → violación de CHECK → la migración aborta toda la transacción. División por cero descartada (CHECK `merma_default < 1` y `merma_coeficiente < 1`, verificados). Riesgo real solo en datos extremos.
- **Probabilidad:** Baja (cantidades en gramos, coeficientes < 1).
- **Solución:** `GREATEST(round(...,4), 0.0001)` o validar que ningún lote queda en 0 antes del COMMIT.

#### DB-M2 · `costo_unitario numeric(14,2)` pierde precisión al inflarse por merma en F3

- **Evidencia:** `20260530000001:36-40` recalcula `costo_unitario / (1 - coef)` con `round(...,4)`, pero la columna es `numeric(14,2)` (verificado). Además F2 (`20260530000000`) divide costos implícitamente al escalar cantidades ×1000 sin tocar `costo_unitario` de lote — el costo del lote queda "por unidad base vieja". **Atención:** `20260530000000` reescala cantidades de `lotes` (kg→g ×1000) pero NO ajusta `lotes.costo_unitario`; el costo unitario queda expresado por kg mientras la cantidad pasa a gramos → `fn_costo_receta` multiplicaría cantidad(g) × costo(por kg) = costo ×1000 inflado.
- **Impacto:** **Posible error de costeo ×1000** si una sala tuviera lotes en kg/l al momento de F2. Para el tenant real es mitigado: el catálogo (`20260530000003`) recarga lotes ya en g/ml con costo por unidad base correcto y soft-borra los viejos; F2/F3 corren ANTES sobre datos demo. Pero el orden migratorio deja una ventana donde el costo es inconsistente, y en multi-tenant (otra sala con kg) sería un bug de costeo grave.
- **Probabilidad:** Baja en tenant actual; Alta en cualquier tenant con lotes kg/l preexistentes.
- **Solución:** En `20260530000000`, al escalar cantidades de lote ×1000 (kg→g), dividir `costo_unitario` /1000 (de $/kg a $/g) en el mismo UPDATE. HIPÓTESIS de bug — confirmar con el dueño si algún tenant tiene lotes kg/l antes de F2.

#### DB-M3 · `pedido_items` permite líneas duplicadas (sin unique `(pedido_id, receta_id)`)

- **Evidencia:** Constraints de `pedido_items`: solo `cantidad>0` + FKs. No hay unique.
- **Impacto:** Misma receta dos veces en un pedido como filas separadas. Puede ser intencional (notas distintas), pero complica conteos y el descuento FEFO duplicaría idempotency si no se agrega por receta.
- **Probabilidad:** Media.
- **Solución:** Decidir negocio; si se desea consolidar, unique parcial o agregación en `create`.

#### DB-M4 · `mensajes_chat` referenciado por el refoco (ruteo zona→cocina) pero sin tabla `pedido_eventos` inmutable

- **Evidencia:** `pedido_eventos` (trazabilidad AMEX, append-only por diseño) NO tiene trigger `prevent_mutation` (solo `audit_log` y `domain_events` lo tienen, verificado en `pg_trigger`). El refoco amplía su uso (timestamps por transición, `order-repository.ts:107-124`).
- **Impacto:** La trazabilidad AMEX, que CLAUDE.md trata como histórico, es UPDATE/DELETE-able. No es inmutable como las otras tablas de evento.
- **Probabilidad:** Baja.
- **Solución:** Si se considera evento append-only, añadir triggers `prevent_mutation` BEFORE UPDATE/DELETE.

---

### BAJO

#### DB-B1 · `auth_rls_initplan` — 46 políticas re-evalúan `auth.*()`/`current_setting()` por fila

- **Evidencia:** SECURITY/PERFORMANCE advisor: 46 hits (insumos, lotes, pedidos, pedido_items, recetas, etc.).
- **Impacto:** Coste por fila en cada policy; relevante a escala 24/7. Se corrige envolviendo en `(select auth.jwt())` para que el planner lo evalúe una vez. Afecta tablas que el refoco mantiene.
- **Solución:** Reescribir policies con subselect; es masivo pero mecánico.

#### DB-B2 · `multiple_permissive_policies` — 13 tablas con 2+ policies permisivas para SELECT/authenticated

- **Evidencia:** advisor: alertas, despachos, insumos, lotes, pedidos, pedido*items, proveedores, recetas, etc. (las policies `\*\_modify*\*`aplican también a SELECT por usar`FOR ALL`).
- **Impacto:** Postgres evalúa todas las permisivas (OR); coste extra y riesgo de exposición no intencional vía la policy `_modify_` (que permite SELECT a quien pueda modificar).
- **Solución:** Separar `FOR ALL` en `FOR SELECT` + `FOR INSERT/UPDATE/DELETE` con scopes correctos.

#### DB-B3 · `operaciones_idempotentes` y `tenant_codigo_counters` con RLS habilitada pero SIN políticas

- **Evidencia:** SECURITY advisor `rls_enabled_no_policy` para ambas; confirmado `relrowsecurity=true`.
- **Impacto:** Acceso negado por defecto a `authenticated` (deny-all). Funciona porque solo se tocan vía RPC `SECURITY DEFINER` (idempotencia, contadores de código). Correcto por diseño, pero conviene un comentario/política explícita para no confundir.
- **Solución:** Documentar o añadir policy explícita deny + grant a service_role.

#### DB-B4 · `unused_index` — 32 índices sin uso (incluye los del refoco que se eliminará)

- **Evidencia:** advisor. Varios son de tablas que `20260528000000` dropea (`idx_vuelos_*`, `idx_pasajeros_*`, `idx_aircraft_*`, `mv_cogs_*`, `idx_buffet_*`) → se van con la tabla. Otros son legítimamente fríos (`idx_pedidos_activos`, `idx_insumos_activos`) porque la DB tiene poco tráfico aún.
- **Impacto:** Bajo. No borrar índices "frío" en sistema nuevo (stats vacías). Confirmar tras periodo de uso real.
- **Solución:** Reevaluar `unused_index` 30 días post-deploy, no antes.

#### DB-B5 · Advisor SECURITY: `materialized_view_in_api`, `security_definer_view`, `function_search_path_mutable`, `anon_security_definer_function_executable`

- **Evidencia:** SECURITY advisor.
  - `v_retencion_estado` es SECURITY DEFINER view (ERROR del linter) — `20260527000001` (no aplicada aún). Revisar al aplicar.
  - `mv_cogs_per_passenger`, `mv_ocupacion_diaria`, `mv_consumo_vs_produccion_turno` selectables por anon/authenticated. Las dos primeras las dropea `20260528000000`; queda `mv_consumo_vs_produccion_turno` expuesta.
  - `fn_fin_bloque`, `cerrar_turnos_expirados`, `fn_validate_receta_ingrediente_tenant`, `fn_validate_tanda_tenant` con `search_path` mutable (riesgo de hijacking en SECURITY DEFINER).
  - `fn_assert_same_tenant`, `fn_costo_receta`, `fn_siguiente_codigo_*`, `refresh_ocupacion_diaria*`, `fn_purgar_*` ejecutables por `anon` (sin sesión). `fn_costo_receta` filtra tenant por argumento → un anónimo podría costear recetas de cualquier tenant si conoce los UUID.
- **Impacto:** Medio puntual (exposición de funciones a `anon`). Varias quedan obsoletas tras el refoco (afluencia/ocupación).
- **Solución:** `REVOKE EXECUTE ... FROM anon, authenticated` salvo las realmente públicas; `SET search_path = public` en todas las SECURITY DEFINER faltantes; quitar MV del API (`REVOKE SELECT`).

#### DB-B6 · `auth_leaked_password_protection` deshabilitado

- **Evidencia:** SECURITY advisor. Config de Supabase Auth (no DDL).
- **Solución:** Habilitar HaveIBeenPwned en Auth settings.

---

## 2. Cosas que están BIEN (verificadas)

- **Idempotencia de las migraciones del refoco:** `20260528000001` y `20260526200000` usan `ADD VALUE IF NOT EXISTS` (correcto, sin BEGIN/COMMIT por restricción de enum). `20260528000002` usa `CREATE TYPE` con guard `duplicate_object` + `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. `20260530000000/01/03` documentan y aplican guards reales (filtran por unidad/coeficiente/merma_default ya procesado; `ON CONFLICT DO NOTHING` / `NOT EXISTS`). **Re-ejecución no duplica ni re-escala** — verificado por lógica.
- **Migración destructiva `20260528000000`:** orden correcto (vistas → MV → funciones → tablas), `DROP ... IF EXISTS`, transaccional. Recrea `refresh_analytics_views` con REVOKE/GRANT correctos. Enums dejados inertes (decisión documentada; Postgres no permite DROP VALUE).
- **Tipos monetarios/cantidad:** `costo_unitario numeric(14,2)`, `cantidad/stock_minimo numeric(12,4)`, `merma_default numeric(5,4)` — conformes a CLAUDE.md. `cantidad` de `pedido_items` es `integer` (porciones, correcto).
- **RLS:** todas las tablas con `tenant_id` tienen `relrowsecurity=true` (27/27 verificadas). El refoco no crea tablas nuevas (solo columnas en tablas ya con RLS), así que no introduce tablas sin RLS.
- **Inmutabilidad:** `audit_log` (hash chain + prevent_mutation) y `domain_events` (prevent_mutation) con triggers BEFORE UPDATE/DELETE confirmados.
- **Optimistic locking:** `transition` y `asignarCocinero` usan `.eq('version', version)` con manejo de `PGRST116`→`VERSION_CONFLICT` (`order-repository.ts:316,346`). Correcto.
- **Unicidad de código:** `insumos_tenant_codigo_unique (tenant_id, codigo)` y `idx_lotes_tenant_codigo` (parcial) existen → el `ON CONFLICT (tenant_id, codigo)` del catálogo es válido.
- **FEFO:** `idx_lotes_fefo (tenant_id, insumo_id, fecha_vencimiento, created_at)` parcial activo presente; `fn_costo_receta` ordena `fecha_vencimiento ASC NULLS LAST, created_at ASC` (consistente con FEFO).

---

## 3. Score de Base de Datos: 72 / 100

Justificación:

- Fundamentos sólidos (RLS universal, tipos correctos, inmutabilidad de eventos, optimistic locking, idempotencia migratoria real): +base alta.
- Penalizaciones del DELTA del refoco:
  - **−12** DB-C1 (FK a `auth.users` rompe modelo y aislamiento de tenant).
  - **−8** DB-C2 (creación de pedido no atómica → huérfanos).
  - **−5** DB-A1 (gap de reclasificación de recetas `cocina`).
  - **−4** DB-A2/A3 (sin triggers de tenant en pedido_items/eventos).
  - **−3** DB-M2 (riesgo de costeo ×1000 en multi-tenant con lotes kg/l).
  - **−6** acumulado advisors (initplan ×46, multiple_permissive ×13, funciones anon/search_path) — deuda transversal heredada, no creada por el refoco.

El refoco en sí está bien ejecutado a nivel de idempotencia y reversibilidad documentada; los puntos rojos son la FK mal apuntada, la no-atomicidad del pedido y los gaps multi-tenant que CLAUDE.md exige cubrir.

---

## 4. Top 3 (acción inmediata)

1. **DB-C1** — `pedidos.cocinero_id` debe referenciar `public.users(id)`, no `auth.users(id)`; añadir validación de tenant. (`20260528000002:25`)
2. **DB-C2** — Hacer atómica la creación pedido+ítems (RPC o compensación). (`order-repository.ts:229-270`)
3. **DB-A1 + DB-M2** — Reclasificar recetas `area_produccion='cocina'` en la migración (no "manual"), y ajustar `costo_unitario` al reescalar unidades kg/l→g/ml en F2 para evitar costeo ×1000 en multi-tenant.
