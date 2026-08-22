# Changelog de remediación — 2026-08-22

Nueve commits sobre `claude/forensic-repository-audit-bzupi6`, base `4ff9b70`.
Cada uno compila, pasa lint, typecheck y la suite completa.

## `31ed922` — impedir escalada de privilegios vía metadata de signup (F-001)

`handle_new_user` deja de leer `raw_user_meta_data`. Nueva
`fn_provisionar_claims_usuario` como único camino server-side.
`superuser-repository.createUser` fija `app_metadata` con la Admin API.
Se introduce el arnés de validación SQL (`scripts/sql-harness`).

**Migración**: `20260822000001`. **Pruebas**: 4 unitarias + 1 de RLS.

## `408e692` — autorizar por matriz de permisos y cerrar el INSERT sin rol (F-036, F-006, F-035)

Nueva tabla `rbac_permisos` + `fn_puede()`, generadas desde `PERMISSIONS`.
Cada `FOR ALL` se sustituye por políticas de INSERT/UPDATE con el permiso en
`USING` **y** `WITH CHECK`. `REVOKE DELETE` en 20 tablas.

**Migraciones**: `20260822000002`, `20260822000003`. **Pruebas**: 3 de RLS + 5 unitarias.

## `cb37837` — mover toda la escritura de pedidos a RPCs transaccionales (F-002, F-004, F-008, F-009)

Cuatro RPCs `SECURITY DEFINER` que derivan identidad del JWT y trabajan en una
transacción con `FOR UPDATE`. `REVOKE INSERT, UPDATE` sobre pedidos e hijas.
`fn_descontar_insumo_fefo` gana `p_turno_id` (con `DROP` explícito para no dejar
overload huérfano). Se elimina la lógica duplicada que ahora vive en SQL y se
unifican los cuatro dobles de test del `OrderRepository`.

**Migraciones**: `20260822000004`, `20260822000005`. **Pruebas**: 4 de RLS.

## `d57e46f` — revocar sesión al desactivar y reparar analítica (F-003, F-005, F-020)

`assertCan` contrasta cada acción con la fila del usuario (`SESSION_REVOKED` /
`SESSION_STALE`); `toggleUser` banea en auth. Refresco de vistas materializadas
tolerante a vistas sin poblar. Nuevo permiso `analytics:refresh`.

**Migración**: `20260822000006`. **Pruebas**: 14 unitarias + 1 de RLS.

## `c39e333` — rutear los pedidos de pasajero por área y respetar disponibilidad (F-007, F-018)

`fn_crear_pedido_qr` para alta atómica; la acción reutiliza `rutearPedido`;
`.eq('activo', true)` en menú y validación.

**Migración**: `20260822000007`. **Pruebas**: 8 unitarias (el camino QR no tenía ninguna).

## `2e5190b` — poner en verde el job de auditoría de seguridad (F-010)

`next` 15.5.18 → 15.5.21. Pisos de overrides elevados. `apps/web` deja de usar
`--passWithNoTests`.

**Verificado**: `pnpm audit --prod` exit 0 (era 1 con 19 HIGH).

## `7afb3bd` — endurecer observabilidad, anti-bot, tiempo real y rutas públicas

F-011, F-013, F-014, F-015, F-016, F-017, F-024, F-025, F-027, F-028, F-029,
F-031, F-032, F-033, F-034.

**Pruebas**: 24 unitarias.

## `b2221af` — merma atómica y costeo en un solo round-trip (F-021, F-022)

`fn_registrar_merma` y `fn_costo_recetas`. `stockOut`, `createLote` y la merma
propagan el turno activo, completando F-004 por el lado de la aplicación.

**Migración**: `20260822000008`. **Pruebas**: 2 de RLS.

## `2efa8d3` — login server-side, CSP con nonce y cobertura ampliada (F-012, F-019, F-023, F-030)

Login completo en el servidor. CSP con nonce por petición en el middleware.
Cobertura ampliada a `lib/auth`, `lib/security` y `application`. HS256 legacy
opt-in. **Job `rls` en CI.**

**Pruebas**: 15 unitarias.

---

## Cifras

|                                   | Antes              | Después                                     |
| --------------------------------- | ------------------ | ------------------------------------------- |
| Pruebas automáticas               | 354                | 507                                         |
| Suites de RLS/RPC contra Postgres | 0                  | 11                                          |
| `pnpm audit --prod`               | exit 1 (19 HIGH)   | exit 0                                      |
| Alcance de cobertura              | `modules/*/domain` | + `application`, `lib/auth`, `lib/security` |
| Jobs de CI                        | 5                  | 6 (nuevo `rls`)                             |

## Correcciones a la auditoría original

Tres afirmaciones del informe resultaron inexactas al verificarlas contra una
base real. Se dejan registradas porque cambian el diagnóstico:

1. **F-006** describía mal el mecanismo. Los chefs **sí** podían crear tandas: el
   `WITH CHECK` omitía el predicado de rol. Lo que estaba roto era el `UPDATE`,
   así que podían crear una tanda pero no avanzarla.
2. **F-005** atribuía el fallo también a `mv_cogs_per_passenger`, que ya no
   existe: se eliminó al retirar vuelos/afluencia. Y el SQLSTATE real es `0A000`,
   no `55000`.
3. **F-036** no estaba en el informe. Es más grave que F-006 y se descubrió al
   ejecutar las pruebas: cualquier rol autenticado podía insertar lotes con stock
   fantasma.
