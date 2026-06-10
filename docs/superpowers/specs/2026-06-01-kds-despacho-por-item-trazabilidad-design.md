# KDS — Despacho por ítem y área + Trazabilidad de producto — Diseño

**Fecha:** 2026-06-01
**Estado:** Diseño aprobado (pendiente revisión de spec)
**Alcance:** Spec 1 del enfoque incremental para el KDS. Quedan FUERA de este spec
(plan corto siguiente): alerta sonora+visual de pedido nuevo, vista all-day, y la
revisión del flujo/interfaces de los usuarios de snack/buffet/AMEX.

---

## 1. Objetivo

Hoy el KDS opera el ciclo de vida a nivel de **pedido completo** (un solo `estado`,
una sola acción de despacho). Esto no refleja la cocina real: un pedido puede tocar
varias áreas (cocina fría + caliente) y cada área debería poder **avanzar y despachar
solo sus ítems** de forma independiente.

Este spec entrega:

1. **Estado por ítem** y **despacho por área** — cada área marca y despacha solo lo suyo.
2. **Recall** — deshacer el "listo" de un ítem por error (antes de entregar), con traza.
3. **Trazabilidad completa del producto** — log append-only por ítem (quién/cuándo en
   cada transición) y una **vista admin** que muestra origen, responsables, fechas/horas,
   cantidades, tiempos y la línea de tiempo completa de cada pedido.

## 2. Estado actual (resumen)

- `pedidos.estado`: `creado → recibido_cocina → en_preparacion → despachado → entregado/cancelado`
  (`PEDIDO_TRANSITIONS` en `packages/shared-types/src/enums.ts`).
- `pedido_items`: `id, pedido_id, receta_id, cantidad, notas, area_produccion` — **sin estado**.
- `pedido_eventos`: log append-only a nivel pedido (`estado, actor_id, created_at`).
- Ruteo por producto vía `area_produccion` del ítem + matriz `ZONA_AREAS_PERMITIDAS`.
- Tableros: `kds-board-area` (fría/caliente), `kds-board-amex`, `pedido-card`.
- Permisos por área ya existentes: `cocina_fria:write`, `cocina_caliente:write`,
  `cocina_amex:write` (se reutilizan; no se crean permisos nuevos).
- Acciones a nivel pedido en `apps/web/src/modules/orders/actions.ts`
  (`iniciarPreparacion`, `despacharPedido`, etc.) con concurrencia optimista (`version`)
  y guard multi-tenant.

## 3. Modelo de datos (migración)

Nueva migración `supabase/migrations/20260601000001_kds_estado_por_item.sql` (idempotente,
RLS habilitada, convención del proyecto):

### 3.1 `pedido_items` — estado y tiempos

- `estado` enum-text con CHECK: `pendiente | en_preparacion | listo` (default `pendiente`).
- `en_preparacion_at timestamptz null`, `listo_at timestamptz null` (caché de tiempos).
- `iniciado_por uuid null REFERENCES public.users(id) ON DELETE SET NULL`.
- `listo_por uuid null REFERENCES public.users(id) ON DELETE SET NULL`.

### 3.2 `pedido_item_eventos` — log append-only (fuente de verdad de la traza por ítem)

Sigue la convención de `pedido_eventos`:

```
id            uuid pk default gen_random_uuid()
tenant_id     uuid not null            -- FK lógica al tenant (RLS)
pedido_id     uuid not null REFERENCES public.pedidos(id) ON DELETE CASCADE
item_id       uuid not null REFERENCES public.pedido_items(id) ON DELETE CASCADE
estado        text not null            -- pendiente|en_preparacion|listo (incluye recalls)
actor_id      uuid null REFERENCES public.users(id) ON DELETE SET NULL
created_at    timestamptz not null default now()
```

- Índices: `(tenant_id, pedido_id)`, `(item_id, created_at)`.
- Append-only: sin UPDATE/DELETE en la lógica de app. Un recall se registra como una
  **nueva fila** con `estado = en_preparacion` (queda el rastro de que se deshizo).

### 3.3 Backfill (datos existentes)

Por cada pedido existente, setear `pedido_items.estado` según el estado del pedido:

- pedido en `despachado`/`entregado` → ítems `listo` (con `listo_at = pedidos.updated_at`).
- pedido en `en_preparacion` → ítems `en_preparacion`.
- resto (`creado`/`recibido_cocina`/`cancelado`) → ítems `pendiente`.
  No se generan filas históricas en `pedido_item_eventos` para el backfill (la traza por
  ítem aplica de aquí en adelante; el histórico previo vive en `pedido_eventos`).

### 3.4 `pedidos.estado` pasa a ser DERIVADO

Se conserva la columna (consumidores: mesero, descuento de stock en `entregar`, analítica),
pero su valor se **recalcula** a partir de los ítems cada vez que un ítem cambia:

- todos los ítems `pendiente` → `recibido_cocina` (si ya fue recibido) o se mantiene `creado`.
- algún ítem `en_preparacion` (y no todos `listo`) → `en_preparacion`.
- todos los ítems `listo` → `despachado` (listo para mesero).
- `entregado` y `cancelado` siguen gobernándose a nivel pedido (acciones existentes).

## 4. Máquina de estados por ítem (shared-types)

En `packages/shared-types/src/enums.ts`:

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

Función de derivación pura (dominio, `apps/web/src/modules/orders/domain/`):
`estadoPedidoDesdeItems(items, estadoActual): EstadoPedido` — implementa la regla §3.4.
No lanza; es pura y testeable de forma aislada.

## 5. Capa de aplicación / acciones (módulo orders)

Acciones nuevas en `actions.ts` (todas: `assertCan` por área → validar transición →
repo con `version` → `auditLog` → insertar `pedido_item_eventos` → recalcular
`pedidos.estado` → emitir socket):

- `iniciarItem(itemId, version)` — perm del área del ítem; `pendiente→en_preparacion`;
  set `en_preparacion_at`, `iniciado_por`.
- `marcarItemListo(itemId, version)` — perm del área; `en_preparacion→listo`;
  set `listo_at`, `listo_por`. Si con esto **todos** los ítems quedan `listo`,
  el pedido deriva a `despachado` y se emite a mesero (`CHANNELS.AMEX`).
- `recallItem(itemId)` — perm del área; `listo→en_preparacion`; permitido solo si el
  pedido **no** está `entregado`/`cancelado`; registra evento + `auditLog`.

Mapa área→permiso (servidor):
`cocina_fria→cocina_fria:write`, `cocina_caliente→cocina_caliente:write`,
`amex→cocina_amex:write`. (Pastelería: se define su permiso en el plan si aplica; los
tableros en alcance son fría, caliente y AMEX.)

Concurrencia: se mantiene `version` optimista a nivel pedido; cada acción de ítem
incrementa la versión del pedido para invalidar vistas desincronizadas.

## 6. Tiempo real (socket)

Nuevo evento en `packages/shared-types/src/socket-events.ts`:

```
ITEM_ESTADO { pedidoId, itemId, tenantId, area, estadoAnterior, estadoNuevo, updatedAt }
```

Se emite en `CHANNELS.COCINA` (y `CHANNELS.COCINA_AMEX` si aplica) en cada transición de
ítem. Cuando la derivación lleva el pedido a `despachado`, además se emite el
`PEDIDO_ESTADO` existente hacia `CHANNELS.AMEX` (mesero), preservando el contrato actual.
Los tableros recargan/actualizan la cola al recibir `ITEM_ESTADO`.

## 7. UI — rework de tableros

- `pedido-card.tsx`: de acción única de pedido → **acciones por ítem**. Cada ítem
  muestra su estado y botón contextual (Iniciar / Marcar listo / Recall). Se mantiene
  cronómetro y anillo de urgencia; el anillo usa el ítem más atrasado del área.
- `kds-board-area.tsx` y `kds-board-amex.tsx`: la tarjeta renderiza **solo los ítems del
  área** del tablero; el pedido migra de columna según el estado **agregado de esa área**
  (todos `pendiente`=Nuevos; algún `en_preparacion`=En preparación; todos `listo`=Despachados
  del área). Barra de progreso "{n}/{total} listos" del área.
- `readOnly` se conserva para supervisión.

## 8. Vista admin de trazabilidad

### 8.1 Ruta y permiso

Nueva sección `apps/web/src/app/(dashboard)/admin/trazabilidad/page.tsx`, permiso
`orders:read` restringido a admin/superuser vía el patrón existente del panel admin.

### 8.2 Acciones de lectura (módulo orders)

- `getTrazabilidadPedidos(filtros)` — lista paginada con filtros: rango de fecha,
  zona/origen, estado, responsable (cocinero/actor), mesa. Join de actores (como
  `getEventosPedido`).
- `getTrazaPedido(pedidoId)` — detalle: fusiona `pedido_eventos` + `pedido_item_eventos`
  en una sola línea de tiempo ordenada, con nombres de actor resueltos.

### 8.3 Contenido visible (cobertura del requisito)

| Dato                                                                       | Fuente                                                                                             |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Origen (zona AMEX/Snack/Buffet, mesa, turno)                               | `pedidos.zona, numero_mesa, turno_id`                                                              |
| Fecha/hora de creación y de cada transición                                | `pedidos.created_at`, `pedido_eventos`, `pedido_item_eventos`                                      |
| Responsables: creó, cocinero asignado, quién inició/marcó listo cada ítem  | `creado_por`, `cocinero_id`, `pedido_items.iniciado_por/listo_por`, `pedido_item_eventos.actor_id` |
| Cantidad, producto y área por ítem                                         | `pedido_items.cantidad, receta_nombre, area_produccion`                                            |
| Tiempos: por ítem (inicio→listo) y de pedido (creado→despachado→entregado) | timestamps de ítem + `pedido_eventos`                                                              |
| Línea de tiempo completa (pedido + ítems, con recalls)                     | `pedido_eventos` + `pedido_item_eventos`                                                           |

Tabla maestra con filtros + fila expandible que despliega el detalle (`getTrazaPedido`).
Read-only; sin acciones de mutación.

## 9. Plan de fases

0. **Migración** — `pedido_items.estado`+tiempos+actores, `pedido_item_eventos`, backfill.
1. **Dominio** — `EstadoItem`/`ITEM_TRANSITIONS` + `estadoPedidoDesdeItems()` (TDD puro).
2. **Repo + acciones** — `iniciarItem`/`marcarItemListo`/`recallItem` + evento socket `ITEM_ESTADO`.
3. **Tableros KDS** — rework `pedido-card`, `kds-board-area`, `kds-board-amex`.
4. **Vista admin de trazabilidad** — acciones de lectura + `/admin/trazabilidad`.

## 10. Testing (TDD)

- **Dominio (puro):** `ITEM_TRANSITIONS` válido; `estadoPedidoDesdeItems()` cubre los casos
  (todos pendiente / mixto / todos listo / con cancelado).
- **Repo:** marcar ítem actualiza estado+timestamps; recálculo de `pedidos.estado`; recall
  inserta evento y no rompe append-only.
- **Acciones:** permiso correcto por área (un chef de fría no puede tocar ítems de caliente);
  `version` conflict; guard multi-tenant; emisión de socket.
- **Lectura admin:** filtros y fusión de timeline ordenada con actores resueltos.

## 11. Riesgos / compatibilidad

- **Acciones legacy — DECISIÓN: se deprecan.** `iniciarPreparacion` y `despacharPedido` a
  nivel pedido se **eliminan** del flujo de cocina; el avance pasa a ser exclusivamente por
  ítem (`iniciarItem`/`marcarItemListo`) y `pedidos.estado` se deriva. Consumidores a migrar
  en el plan: `pedido-card.tsx` (KDS) y `components/orders/pedido-table.tsx` (vista `/pedidos`),
  que hoy llaman esas acciones. `recibirEnCocina`, `entregarPedido` y `cancelarPedido`
  **se conservan** (recepción, entrega de mesero y cancelación siguen a nivel pedido).
- **`cocinero_id` — DECISIÓN: se conserva** como "responsable asignado" del pedido; la traza
  fina de quién hizo cada ítem vive en `pedido_items.iniciado_por/listo_por` y
  `pedido_item_eventos`.
- **Backfill:** verificar con datos reales que ningún pedido quede en estado inconsistente.
- **Área legacy `cocina`:** ítems con `area_produccion = 'cocina'` (pre-split) no tienen
  tablero; el backfill los deja consistentes pero el plan debe definir dónde se ven (probable:
  solo en la vista admin, no en tableros de área).
