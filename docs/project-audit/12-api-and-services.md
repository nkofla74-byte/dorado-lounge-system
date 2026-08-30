# 12 · API y servicios

## 1. Superficie total

| Tipo                        | Cantidad                                    |
| --------------------------- | ------------------------------------------- |
| Server Actions exportadas   | **81**                                      |
| Route handlers HTTP         | 4                                           |
| Endpoints del socket-server | 2 (`GET /health`, `POST /emit`) + WebSocket |
| RPC de PostgreSQL invocadas | 8                                           |

**No existe una API REST propia.** El cliente habla con el servidor mediante Server Actions
de Next.js. Los 4 route handlers son para máquinas (cron, monitor, GDPR), no para la UI.

---

## 2. Route handlers HTTP

### `GET /health` · `app/health/route.ts`

Sin autenticación, público. Devuelve `{status:'ok', service:'dorado-web', timestamp}`.
**Comprobado en ejecución: HTTP 200.**

### `GET /api/heartbeat` · `app/api/heartbeat/route.ts`

| Aspecto     | Detalle                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| Auth        | `Authorization: Bearer ${CRON_SECRET}`, comparado con `timingSafeEqual` |
| Rate limit  | bucket `heartbeat` — 60/min por IP                                      |
| Efecto      | `fetch(BETTERSTACK_HEARTBEAT_URL)`                                      |
| Consumidor  | Vercel Cron `0 6 * * *` (`apps/web/vercel.json`)                        |
| Sin secreto | **HTTP 500 `SERVER_MISCONFIGURED`** — verificado en ejecución           |

Este endpoint es el **único** productor del latido. El workflow de GitHub Actions que
pingueaba la misma URL cada 5 min se eliminó: mantenía el monitor en verde aunque el
despliegue estuviera caído (F-011).

### `GET /api/cron/check-alertas` · `app/api/cron/check-alertas/route.ts`

| Aspecto         | Detalle                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | `Bearer ${CRON_SECRET}` con `timingSafeEqual`                                                                                                     |
| Rate limit      | bucket `cron` — 10/min por IP                                                                                                                     |
| Efecto          | Por cada tenant activo, en lotes de 5 con `Promise.allSettled`: `runCheckVencimientos`, `runCheckDemoraAmex`, `runCheckRequisicionesSinDespachar` |
| Respuesta       | `{ok, tenants, vencimientos, demoras, requisiciones, timestamp}`                                                                                  |
| Consumidor real | **`pg_cron` cada 5 min** vía `net.http_post`                                                                                                      |
| Respaldo        | Vercel Cron diario `0 3 * * *`                                                                                                                    |
| Sin secreto     | HTTP 500 — verificado en ejecución                                                                                                                |

El procesamiento en lotes de 5 con `allSettled` es correcto: un tenant que falle no tumba el
resto.

### `POST /api/gdpr/forget` · `app/api/gdpr/forget/route.ts`

| Aspecto    | Detalle                                                          |
| ---------- | ---------------------------------------------------------------- |
| Auth       | Sesión de usuario (`supabase.auth.getUser()`)                    |
| Rate limit | bucket `gdpr` — 3/día por usuario, **fail-closed en producción** |
| Efecto     | `auditLog` → anonimiza el email en Supabase Auth → `signOut()`   |
| Sin sesión | 302 → `/login` (no es ruta pública) — verificado en ejecución    |

🟡 **Implementación parcial.** Anonimiza `auth.users.email` y `user_metadata`, pero **no toca
`public.users.nombre`**, que sigue conteniendo el nombre real y es lo que se muestra en la
interfaz y se referencia desde `turnos.responsable_id`, `pedidos.responsable_id`, etc.
Un derecho de supresión efectivo debería cubrirlo. Registrado como **DT-07**.

---

## 3. Server Actions — inventario por módulo

Las 81 acciones siguen sin excepción el patrón:
`'use server'` → `assertCan(permiso)` → `Zod.safeParse` (si hay escritura) → repositorio o
RPC → `auditLog` → `emitEvent` (si aplica) → `Result<T>`.

**Comprobado: no hay ninguna acción de escritura sin `assertCan`.**

| Módulo           | Nº  | Lectura                                                                                                                                                                                                       | Escritura                                                                                                                                                             |
| ---------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders`         | 17  | `getPedidos`, `getPedidosByArea`, `getPedidosZona`, `getPedidosTurnoZona`, `getPedidosHistorial`, `getCartaServicio`, `getCartaElaboraciones`, `getEventosPedido`, `getTrazabilidadPedidos`, `getTrazaPedido` | `createPedido`, `recibirEnCocina`, `asignarCocinero`, `entregarPedido`, `cancelarPedido`, `iniciarItem`, `marcarItemListo`, `recallItem`, `toggleDisponibilidadPlato` |
| `inventory`      | 9   | `getInsumos`, `getLotesByInsumo`, `getLotesProximosVencer`                                                                                                                                                    | `createInsumo`, `updateInsumo`, `createInsumosBulk`, `createLote`, `stockOut`, `registrarMerma`                                                                       |
| `production`     | 7   | `getTandas`, `getTandasDisponiblesZona`, `getSolicitudesCocina` 🔵                                                                                                                                            | `createTanda`, `iniciarTanda`, `completarTanda`, `cancelarTanda`                                                                                                      |
| `superuser`      | 7   | `getTenants`, `getTenantById`, `getUsers`                                                                                                                                                                     | `crearTenant`, `toggleTenant`, `crearUsuario`, `toggleUser`, `cambiarRolUsuario`                                                                                      |
| `turnos`         | 6   | `getTurnos`, `getTurnoActivo`, `getMiTurnoActivo`, `getUsuariosResumen`                                                                                                                                       | `iniciarTurno`, `cerrarTurno`                                                                                                                                         |
| `alertas`        | 6   | `getAlertas`, `getAlertasUnreadCount`, `getAlertasAdmin`                                                                                                                                                      | `marcarAlertaLeida`, `marcarTodasLeidas`, `checkVencimientos`, `checkDemoraAmex`                                                                                      |
| `requisiciones`  | 6   | `getColaAlmacen`, `getRequisicionesArea`                                                                                                                                                                      | `createRequisicion`, `alistarRequisicion`, `despacharRequisicion`, `confirmarRecibido`, `cancelarRequisicion`                                                         |
| `cocina-amex`    | 5   | `getPedidosAmexKds`, `getEventosPedidoAmex`                                                                                                                                                                   | `recibirPedidoAmex`, `iniciarPreparacionAmex`, `despacharPedidoAmex`                                                                                                  |
| `proveedores`    | 5   | `getProveedores`, `getHistorialCompras`                                                                                                                                                                       | `createProveedor`, `updateProveedor`, `deleteProveedor`                                                                                                               |
| `recipes`        | 4   | `getRecetas`                                                                                                                                                                                                  | `createReceta`, `addIngredienteAReceta`, `updateRecetaMenuMeta`                                                                                                       |
| `analytics`      | 2   | `fetchConsumoVsProduccion` ⚫                                                                                                                                                                                 | `refreshAnalytics`                                                                                                                                                    |
| `costos`         | 2   | `getCostoReceta`, `getCostosRecetas`                                                                                                                                                                          | —                                                                                                                                                                     |
| `admin/personal` | 5   | `getPersonal`                                                                                                                                                                                                 | `crearPersonal`, `togglePersonal`, `cambiarRolPersonal`, `eliminarPersonal`                                                                                           |
| `admin/qr`       | 1   | —                                                                                                                                                                                                             | `generateQRLink`                                                                                                                                                      |
| `qr/[locale]`    | 2   | `getMenuPublico`                                                                                                                                                                                              | `createPedidoFromQR` (sin `assertCan`: la credencial es el JWT de mesa)                                                                                               |
| `(auth)/login`   | 1   | —                                                                                                                                                                                                             | `iniciarSesion`                                                                                                                                                       |

---

## 4. RPC de PostgreSQL invocadas desde la aplicación

| RPC                                                                                                                   | Llamada desde                       | Cliente |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------- |
| `fn_descontar_insumo_fefo`                                                                                            | `inventory/actions.ts` → `stockOut` | admin   |
| `fn_registrar_merma`                                                                                                  | `inventory/actions.ts`              | usuario |
| `fn_completar_tanda`                                                                                                  | `production/actions.ts`             | admin   |
| `fn_crear_pedido_qr`                                                                                                  | `qr/[locale]/actions.ts`            | admin   |
| `refresh_analytics_views`                                                                                             | `analytics/actions.ts`              | admin   |
| `fn_costo_receta` / `fn_costo_recetas`                                                                                | `costos/infrastructure/`            | usuario |
| `fn_crear_pedido`, `fn_entregar_pedido`, `fn_pedido_transicion`, `fn_transicionar_item`, `fn_pedido_asignar_cocinero` | repositorios de `orders`            | usuario |

---

## 5. Contrato de tiempo real — auditoría de conexión

`packages/shared-types/src/socket-events.ts` declara **11 canales** y **10 tipos de evento**.
Esta tabla cruza quién emite con quién escucha, medido con `grep` sobre todo el código:

| Evento                  | Emisores                                | Consumidores en la UI                                      | Estado |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------- | ------ |
| `PEDIDO_CREADO`         | `orders/actions`, `qr/actions`          | `kds-board-area`, `kds-board-amex`, `zona-view`            | 🟢     |
| `PEDIDO_ESTADO`         | `orders/actions`, `cocina-amex/actions` | `kds-board-area`, `kds-board-amex`, `zona-view`            | 🟢     |
| `ITEM_ESTADO`           | `orders/actions`                        | `kds-board-area`, `kds-board-amex`                         | 🟢     |
| `REQUISICION_ESTADO`    | `requisiciones/actions`                 | `requisiciones-panel`                                      | 🟢     |
| `ALERTA`                | `alertas/infrastructure/checks`         | `alertas-bell` — **pero sin `join`**                       | 🔵     |
| `PEDIDO_COCINERO`       | `orders/actions`                        | **ninguno**                                                | 🔵     |
| `TURNO_EVENTO`          | `turnos/actions`                        | **ninguno** (va a `sala:admin`, canal al que nadie se une) | 🔵     |
| `SOLICITUD_PREPARACION` | **ninguno**                             | `solicitudes-panel`                                        | 🔵     |
| `STOCK_OUT`             | **ninguno**                             | **ninguno**                                                | 🔴     |
| `DESPACHO`              | **ninguno**                             | **ninguno**                                                | 🔴     |

### Canales

| Canal                    |       ¿Emite alguien?        |      ¿Se une alguien?      | Estado |
| ------------------------ | :--------------------------: | :------------------------: | ------ |
| `sala:cocina`            |            ✅ (6)            |  ✅ (KDS fría y caliente)  | 🟢     |
| `sala:cocina:amex`       |            ✅ (7)            |   ✅ (`kds-board-amex`)    | 🟢     |
| `sala:cocina:pasteleria` |            ✅ (2)            |    ✅ (KDS pastelería)     | 🟢     |
| `sala:amex`              |        ✅ (3 + zona)         |      ✅ (`zona-view`)      | 🟢     |
| `sala:almacen`           |       ✅ (1 + alertas)       | ✅ (`requisiciones-panel`) | 🟢     |
| `sala:snack`             |   ✅ (vía `ZONA_CHANNEL`)    |      ✅ (`zona-view`)      | 🟢     |
| `sala:buffet`            |   ✅ (vía `ZONA_CHANNEL`)    |      ✅ (`zona-view`)      | 🟢     |
| `sala:admin`             | ✅ (`TURNO_EVENTO`, alertas) |             ❌             | 🔵     |
| `sala:cocina:fria`       |         solo alertas         |             ❌             | 🔵     |
| `sala:cocina:caliente`   |         solo alertas         |             ❌             | 🔵     |
| `sala:broadcast:cocina`  |              ❌              |  ✅ (`solicitudes-panel`)  | 🔵     |

**Conclusión:** 7 de 11 canales funcionan de extremo a extremo. Los 4 restantes están
declarados y con ACL, pero un extremo falta. El caso más grave es `sala:admin` combinado con
`AlertasBell`: las alertas se emiten a canales a los que ningún cliente pertenece.

### Cómo se pierde el evento — mecánica exacta

```js
// apps/socket-server/src/lib/emit-handler.ts
const room = `${tenantId}:${channel}`;
io.to(room).emit('event', event);
```

Socket.io solo entrega a los sockets **unidos a esa sala**. Un cliente que nunca ejecuta
`socket.emit('join', canal)` no pertenece a ninguna sala y, por definición, no recibe nada.
`AlertasBell` registra `socket.on('event', handle)` pero nunca emite `join`.

---

## 6. `POST /emit` del socket-server

| Aspecto        | Detalle                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Auth           | `Bearer ${SOCKET_EMIT_SECRET}` con `timingSafeEqual`                                                                 |
| Rate limit     | 1 200 req/min por IP reenviada (`x-forwarded-for`), no por IP del proxy (F-025)                                      |
| Límite de body | 64 KB → HTTP 413                                                                                                     |
| Validación     | `tenantId` debe casar con un regex UUID; `channel` debe estar en `CHANNELS`; el evento debe tener `type` y `payload` |
| Sin secreto    | HTTP 500 `SERVER_MISCONFIGURED`                                                                                      |
| Llamante       | `lib/socket/emit-event.ts`, con timeout de 1 500 ms y fallo silencioso                                               |

Endpoint bien blindado: autenticación en tiempo constante, allowlist de canales, tope de
payload y limpieza periódica del mapa de buckets para evitar fuga de memoria.

---

## 7. Código muerto y huecos

| Hallazgo                                             | Tipo                                     |
| ---------------------------------------------------- | ---------------------------------------- |
| `getSolicitudesCocina` devuelve `ok([])` siempre     | Backend sin datos, con UI que lo consume |
| Eventos `STOCK_OUT` y `DESPACHO`                     | Contrato sin emisor **ni** consumidor    |
| Evento `SOLICITUD_PREPARACION`                       | Consumidor sin emisor                    |
| Eventos `PEDIDO_COCINERO` y `TURNO_EVENTO`           | Emisor sin consumidor                    |
| 8 esquemas Zod huérfanos                             | Contrato sin uso (ver `08-forms.md §10`) |
| `mv_cogs_per_passenger` en `refresh_analytics_views` | Referencia a objeto eliminado            |

**No hay ningún caso inverso**: no existe botón que llame a una acción inexistente, ni acción
que apunte a una tabla que no esté.
