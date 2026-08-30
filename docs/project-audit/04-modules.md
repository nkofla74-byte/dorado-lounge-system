# 04 · Módulos

Trece módulos hexagonales en `apps/web/src/modules/`. Para cada uno: qué hace realmente,
qué superficie expone, con qué se probó y qué le falta.

Leyenda: 🟢 completa · 🟡 parcial · 🔵 implementada pero no conectada · 🟠 mock/demo ·
⚪ preparada · 🔴 no implementada · ⚫ rota

---

## `inventory` — 🟢 90 %

**Responsabilidad.** Insumos, lotes, merma en recepción, descuento FEFO.

| Capa              | Ficheros                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `domain/`         | `insumo.ts`, `lote-vencimiento.ts`, `merma.ts`                        |
| `application/`    | `create-insumo`, `update-insumo`, `create-lote`, `get-insumos` + port |
| `infrastructure/` | `insumo-repository.ts`                                                |
| `actions.ts`      | 8 acciones                                                            |
| `tests/`          | 4 ficheros — 60 pruebas (merma sola tiene 35)                         |

**Acciones:** `getInsumos`, `createInsumo`, `updateInsumo`, `createInsumosBulk`,
`getLotesByInsumo`, `stockOut`, `registrarMerma`, `createLote`, `getLotesProximosVencer`.

**Merma — modelo F3 (2026-05-30).** `aplicarMermaRecepcion(comprado, coef) = comprado × (1 − coef)`
y `costoUnitarioNeto = costo / (1 − coef)`, que preserva el valor total del lote. La fuente
autoritativa es `insumos.merma_default` (`numeric(5,4)`);
`receta_ingredientes.merma_coeficiente` queda como histórico. 35 pruebas cubren el dominio.

**FEFO — solo en SQL.** Toda deducción pasa por `fn_descontar_insumo_fefo`, atómica con
`FOR UPDATE` e idempotente por `idempotency_key`. **No está reimplementada en TypeScript**
(comprobado: `fefo-concurrency.test.ts` verifica el contrato, no la lógica).

**Qué falta.** No hay UI de conteo físico ni de ajuste de inventario, aunque
`tipo_movimiento` incluye `conteo` y `ajuste` y la vista de analítica los agrega. Ver
[`19-pending-features.md`](./19-pending-features.md).

---

## `recipes` — 🟢 85 %

**Responsabilidad.** Recetas de producción y de servicio, ingredientes, metadatos de menú.

**Acciones:** `getRecetas`, `createReceta`, `addIngredienteAReceta`, `updateRecetaMenuMeta`.

Constraints reales en base que hacen cumplir el modelo:
`recetas_produccion_tiene_destino`, `recetas_produccion_tiene_rendimiento`,
`recetas_servicio_tiene_zona`. Una receta de producción no puede existir sin insumo destino
ni rendimiento; una de servicio, sin zona.

**Qué falta.** No hay acción de **eliminar** ni de **editar** una receta existente más allá
de sus metadatos de menú, ni de quitar un ingrediente ya añadido. El `deleted_at` de `recetas`
existe pero ninguna acción lo escribe. Ver DT-06.

---

## `production` — 🟡 80 %

**Responsabilidad.** Tandas de producción (capa 1 → capa 2) y despachos a zona.

**Acciones:** `getTandas`, `createTanda`, `iniciarTanda`, `completarTanda`, `cancelarTanda`,
`getTandasDisponiblesZona`, `getSolicitudesCocina`.

`completarTanda` delega en la RPC `fn_completar_tanda`, que **materializa la capa 2** en un
solo paso atómico (cierre de F-037; hay prueba de RLS `f037_capa2_se_materializa` que pasa).

### 🔵 Código muerto identificado

```ts
// apps/web/src/modules/production/actions.ts:263
export async function getSolicitudesCocina(_limit = 20): Promise<Result<SolicitudCocina[]>> {
  // mensajes_chat eliminado (refoco operacional 2026-05-28); retorna vacío.
  return ok([]);
}
```

Devuelve siempre lista vacía. Alimenta `SolicitudesPanel`, que se renderiza en
`/pasteleria` y escucha el evento `SOLICITUD_PREPARACION` — **evento que ningún punto del
código emite**. Es una pantalla que nunca mostrará nada.

---

## `orders` — 🟢 88 %

El módulo más grande: **17 acciones**, 11 ficheros de prueba.

| Acción                                           | Permiso           | Nota                                               |
| ------------------------------------------------ | ----------------- | -------------------------------------------------- |
| `getCartaServicio`                               | `recipes:read`    | Carta AMEX                                         |
| `getCartaElaboraciones`                          | `recipes:read`    | Extras de pastelería / jefe de turno               |
| `getPedidos` / `getPedidosHistorial`             | `orders:read`     |                                                    |
| `getPedidosByArea`                               | `<area>:read`     | Permiso derivado del área                          |
| `getPedidosZona` / `getPedidosTurnoZona`         | `orders:read`     | Snack / Buffet                                     |
| `createPedido`                                   | `orders:create`   | → `fn_crear_pedido`; emite a 3 canales             |
| `recibirEnCocina`                                | `orders:receive`  |                                                    |
| `asignarCocinero`                                | `orders:dispatch` |                                                    |
| `entregarPedido`                                 | `orders:deliver`  | → `fn_entregar_pedido` (FEFO + transición atómica) |
| `cancelarPedido`                                 | `orders:cancel`   |                                                    |
| `iniciarItem` / `marcarItemListo` / `recallItem` | `<area>:write`    | → `fn_transicionar_item`                           |
| `toggleDisponibilidadPlato`                      | `recipes:write`   | 86/disponible desde la carta                       |
| `getTrazabilidadPedidos` / `getTrazaPedido`      | `orders:trace`    | Solo admin                                         |
| `getEventosPedido`                               | `orders:read`     | Log append-only                                    |

**Máquinas de estado** (fuente: `packages/shared-types/src/enums.ts`, replicadas en el ENUM
SQL y verificadas por trigger `tg_pedido_estado`):

```
Pedido: creado → recibido_cocina → en_preparacion → despachado → entregado
        (cancelable en los cuatro primeros)
Ítem:   pendiente → en_preparacion → listo   (listo → en_preparacion solo por recall)
```

El _optimistic locking_ por `version` lo aplica la RPC, no el cliente
(`optimistic-locking.test.ts`, 5 pruebas).

---

## `turnos` — 🟢 85 %

**Acciones:** `getUsuariosResumen`, `getTurnos`, `getTurnoActivo`, `getMiTurnoActivo`,
`iniciarTurno`, `cerrarTurno`.

Cada sesión de usuario es una fila en `turnos`. `teamlider` es **`NOT NULL` en base**, sin
valor por defecto — el requisito de `CLAUDE.md` está enforzado por el esquema, no por la app.
Bloques fijos `6a2 / 2a10 / 10a6` con autocierre por `pg_cron` cada 15 min
(`cerrar_turnos_expirados`).

`TurnoGuard` (en el layout del dashboard) fuerza la apertura de turno antes de operar.

---

## `analytics` — ⚫ 20 % · **ROTO**

**Acciones:** `fetchConsumoVsProduccion`, `refreshAnalytics`.

El módulo está bien escrito y con la dirección hexagonal correcta. **La base de datos no le
deja leer.** Dos defectos independientes, ambos verificados ejecutando SQL:

1. **`permission denied`.** La vista `v_consumo_vs_produccion_turno_tenant` se creó
   `WITH (security_invoker = true)` y **la misma migración**
   (`20260527000000_enterprise_audit_fixes.sql`, líneas 76-89) revoca
   `SELECT ON mv_consumo_vs_produccion_turno FROM authenticated`. Con `security_invoker`
   el privilegio se comprueba contra el llamante, así que la vista es inutilizable:

   ```
   SELECT test.login('…admin…');
   SELECT * FROM public.v_consumo_vs_produccion_turno_tenant LIMIT 1;
   → ERROR: permission denied for materialized view mv_consumo_vs_produccion_turno
   ```

2. **Cero filas para el superuser.** El camino cross-tenant usa `createAdminClient()`
   (`service_role`), que sí puede leer la vista materializada, pero cuyo JWT no lleva
   `app_metadata.tenant_id`; el `WHERE tenant_id = (auth.jwt()…)::uuid` se evalúa a `NULL`
   y descarta todas las filas. Reproducido con una fila real en la vista materializada:

   ```
   filas en mv_consumo_vs_produccion_turno       → 1
   filas vistas como service_role sin tenant     → 0
   ```

3. **Sin refresco programado.** `pg_cron` solo agenda `check-alertas` y
   `cerrar-turnos-expirados`. La vista materializada solo se refresca a mano.

4. **Alcance menor que el documentado.** `CLAUDE.md` promete filtros por _turno, nodo,
   responsable y período_. La vista solo tiene dimensiones `turno` e `insumo`; el repositorio
   implementa filtros de `turnoId`, `desde` y `hasta`. **No existen** nodo ni responsable.

5. **Referencia huérfana.** `refresh_analytics_views` sigue iterando sobre
   `mv_cogs_per_passenger`, vista eliminada en `20260528000000`. Es inocuo (hay guarda de
   existencia) pero es deriva.

---

## `superuser` — 🟢 90 %

CRUD de tenants y usuarios cross-tenant. 7 acciones. `superuser` tiene bypass total de la
matriz de permisos en `assertCan()`, documentado y probado (`assertCan.test.ts`).
`superuser-repository-claims.test.ts` verifica que los claims se provisionan por
`fn_provisionar_claims_usuario` y no a mano.

---

## `cocina-amex` — 🟢 90 %

KDS exclusivo del `sous_chef`: cola AMEX, trazabilidad por orden, cronómetro visible y
alertas de demora. 5 acciones. Emite `PEDIDO_ESTADO` a `sala:cocina:amex` y `sala:amex` en
cada transición — el único par de canales del sistema con emisor **y** receptor conectados.

---

## `proveedores` — 🟢 90 %

CRUD + historial de compras vinculado a `lotes.proveedor_id`. `deleteProveedor` hace _soft
delete_ (`deleted_at`), coherente con la política de "sin borrado físico".

---

## `alertas` — 🟡 55 %

**Motor:** ✅ los cinco tipos de alerta tienen check implementado, en dos modalidades:

| Modalidad  | Checks                                                                            | Disparo                                                                                        |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Por cron   | `runCheckVencimientos`, `runCheckDemoraAmex`, `runCheckRequisicionesSinDespachar` | `pg_cron` cada 5 min → `net.http_post` → `/api/cron/check-alertas` con `Bearer ${CRON_SECRET}` |
| Por evento | `checkStockMinimo`, `checkCambioPrecio`                                           | _fire-and-forget_ al final de `stockOut` y de `createLote`                                     |

Persisten en `alertas` con deduplicación probada (`check-deduplication.test.ts`, 10 pruebas).

🟡 **Hueco de cobertura**: `checkStockMinimo` solo se invoca desde `stockOut`. No se invoca
cuando el stock baja por `entregarPedido` (que descuenta por FEFO dentro de Postgres),
por `registrarMerma` ni por `fn_completar_tanda` — es decir, por los caminos habituales de
consumo. Ver A-1 en [`19-pending-features.md`](./19-pending-features.md).

**Enrutado:** ✅ correcto en el dominio. `canalesDeAlerta(tipo)` mapea cada tipo a sus canales
(cierre de F-016, 5 pruebas).

**Entrega en tiempo real:** 🔵 **no conectada.** `AlertasBell` registra un handler para
eventos `ALERTA` pero **nunca ejecuta `socket.emit('join', …)`**. El servidor difunde con
`io.to(`${tenantId}:${channel}`)`, así que un socket que no se ha unido a ninguna sala no
recibe nada. En la práctica, la campana solo se actualiza al montar el componente y al
abrir el panel.

Además, de los cinco canales a los que se enrutan alertas
(`ADMIN`, `ALMACEN`, `COCINA_FRIA`, `COCINA_CALIENTE`, `COCINA_AMEX`), **solo `ALMACEN` y
`COCINA_AMEX` tienen algún cliente que se una**, y ninguno de los dos escucha `ALERTA`.

---

## `costos` — 🟢 85 %

Coste en tiempo real por receta. No es tabla: es la RPC `fn_costo_receta(tenant, receta)`
que calcula desde `lotes` (FEFO-next por coste). Existe además `fn_costo_recetas` en lote,
que cerró el N+1 del hallazgo F-021 (prueba de RLS `f021_costos_por_lote`, pasa).

---

## `requisiciones` — 🟢 90 %

Requisiciones de insumos cocina → almacén. Estados con _optimistic locking_ + idempotencia,
vinculadas al turno activo.

```
solicitada → en_alistamiento → despachada → recibida
     └────→ cancelada  (solo desde 'solicitada')
```

Superficie embebida en `/almacen`, `/cocina-caliente`, `/cocina-fria` e `/inventario`.
Canal `sala:almacen`, evento `REQUISICION_ESTADO` — **el único evento de este sistema con
emisor y receptor efectivamente conectados fuera de los KDS**: `RequisicionesPanel` sí hace
`socket.emit('join', CHANNELS.ALMACEN)`.

`guardArea()` valida que el rol pueda confirmar el área de la requisición: los turnos rotan,
así que se valida el **área**, no la identidad del solicitante. Buen detalle de dominio.

---

## Librerías auxiliares (no son módulos hexagonales)

| Ruta                      | Qué es                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `lib/auth/`               | `assertCan`, `permissions`, `role-home`, `rutas-publicas`, `login-throttle`, `rbac-sql`, `assignable-roles` |
| `lib/socket/`             | `client`, `socket-provider`, `use-socket`, `emit-event`                                                     |
| `lib/audit.ts`            | Inserción en `audit_log`. El hash chain vive en Postgres, no aquí                                           |
| `lib/rate-limit.ts`       | 5 buckets Upstash                                                                                           |
| `lib/offline/`            | Cola IndexedDB + sync. **Solo la usa el QR del pasajero** (ver §18)                                         |
| `lib/qr/token.ts`         | JWT de mesa HS256                                                                                           |
| `lib/security/csp.ts`     | Construcción de la CSP con nonce por petición                                                               |
| `lib/result.ts`           | Tipo `Result<T>` — sin `try/catch` ad hoc en dominio                                                        |
| `lib/units.ts`            | Conversiones g/ml/unidad                                                                                    |
| `lib/turnos.ts`           | Cálculo de bloque de turno                                                                                  |
| `lib/turnstile/verify.ts` | Verificación anti-bot, _fail-closed_                                                                        |
