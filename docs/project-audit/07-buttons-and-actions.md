# 07 · Botones y acciones

Cada control de la interfaz, con la cadena que ejecuta: **botón → handler → Server Action →
permiso → RPC/tabla → efecto → feedback**.

Las etiquetas se citan desde `apps/web/src/messages/es.json` (fuente real; ningún literal
está escrito en los componentes del dashboard).

Patrón de feedback uniforme en todo el repositorio: `sonner` (`toast.success` / `toast.error`)
y `router.refresh()` o un `refresh()` local tras la operación.

---

## 1. KDS — Cocina Caliente / Fría / Pastelería (`PedidoCard`)

| Botón                             | Handler                             | Server Action                      | Permiso                                                                                                                                | Cadena en base                                                                                                                                                                              | Efecto                                                                                   |
| --------------------------------- | ----------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Iniciar** (`kds.iniciarItem`)   | `handleItemAction(id, iniciarItem)` | `iniciarItem(itemId, version)`     | `cocina_fria:write` / `cocina_caliente:write` / `pasteleria:write` / `cocina_amex:write` — **derivado del área del ítem, en Postgres** | `fn_transicionar_item` → `FOR UPDATE` del pedido, `pedido_items.estado='en_preparacion'`, `en_preparacion_at`, `iniciado_por`, fila en `pedido_item_eventos`, recálculo del estado agregado | Emite `ITEM_ESTADO` a `sala:cocina` (+`amex`/`pasteleria`), refresca la tarjeta, `toast` |
| **Marcar listo**                  | idem                                | `marcarItemListo(itemId, version)` | idem                                                                                                                                   | igual, con `estado='listo'`, `listo_at`, `listo_por`                                                                                                                                        | idem                                                                                     |
| **Recall** (`RotateCcw`)          | idem                                | `recallItem(itemId, version)`      | idem                                                                                                                                   | `listo → en_preparacion` (única transición inversa permitida por `ITEM_TRANSITIONS`)                                                                                                        | idem                                                                                     |
| **Actualizar** (`kds.actualizar`) | `refresh()`                         | `getPedidosByArea(area)`           | `<area>:read`                                                                                                                          | `SELECT` con RLS de tenant                                                                                                                                                                  | Recarga la cola                                                                          |

**Manejo de errores:** las tres acciones devuelven `Result<T>`. Si `ok === false`, se muestra
`toast.error(result.error.message)` y **no** se aplica el cambio optimista. El conflicto de
versión llega como error de la RPC, no como sobrescritura silenciosa.

---

## 2. KDS AMEX (`KdsBoardAmex` / `AmexCard`)

| Botón                   | Server Action                                    | Permiso             | Efecto                                                                                               |
| ----------------------- | ------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------- |
| **Recibir en cocina**   | `recibirPedidoAmex(id, v)`                       | `cocina_amex:write` | `creado → recibido_cocina`; `auditLog`; emite `PEDIDO_ESTADO` a `sala:cocina:amex` **y** `sala:amex` |
| **Iniciar preparación** | `iniciarPreparacionAmex(id, v)`                  | `cocina_amex:write` | `recibido_cocina → en_preparacion`; mismos dos canales                                               |
| **Despachar**           | `despacharPedidoAmex(id, v)`                     | `cocina_amex:write` | `en_preparacion → despachado`; mismos dos canales                                                    |
| Botones de ítem         | `iniciarItem` / `marcarItemListo` / `recallItem` | derivado            | igual que §1                                                                                         |

`AmexCard` aplica **actualización optimista** (`onOptimistic`) antes de confirmar: la tarjeta
cambia de estado al instante y se reconcilia con la respuesta. Si falla, `onRefresh()` vuelve
al estado real del servidor.

---

## 3. Pedidos (`/pedidos`)

| Botón                                       | Server Action                           | Permiso           | Efecto                                                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nuevo pedido** (`pedidos.nuevoPedido`)    | abre diálogo → `createPedido`           | `orders:create`   | `fn_crear_pedido`: pedido + ítems en una transacción, ruteo por área, `idempotency_key`. Emite `PEDIDO_CREADO` a `sala:cocina`, y además a `sala:cocina:amex` o `sala:cocina:pasteleria` según las áreas implicadas |
| **Recibir en cocina**                       | `recibirEnCocina(id, v)`                | `orders:receive`  | `fn_pedido_transicion`; emite a `sala:cocina:amex` y al canal de la zona                                                                                                                                            |
| **Iniciar prep.**                           | transición                              | `orders:dispatch` |                                                                                                                                                                                                                     |
| **Despachar**                               | transición                              | `orders:dispatch` |                                                                                                                                                                                                                     |
| **Confirmar entrega**                       | `entregarPedido(id, v)`                 | `orders:deliver`  | ⭐ `fn_entregar_pedido`: **descuento FEFO de todos los ingredientes + transición a `entregado`, en una sola transacción**. Es el punto donde el inventario se mueve.                                                |
| **Cancelar**                                | `cancelarPedido(id, v)`                 | `orders:cancel`   | Transición a `cancelado` (permitida en los 4 primeros estados)                                                                                                                                                      |
| **Asignar cocinero**                        | `asignarCocinero(id, cocineroId, v)`    | `orders:dispatch` | `fn_pedido_asignar_cocinero`; emite `PEDIDO_COCINERO` (🔵 nadie lo escucha)                                                                                                                                         |
| **Actualizar pedidos**                      | `getPedidos()`                          | `orders:read`     | Recarga                                                                                                                                                                                                             |
| **Toggle 86 / disponible** (en `CartaAmex`) | `toggleDisponibilidadPlato(id, activo)` | `recipes:write`   | `recetas.activo`; oculta el plato también de la carta QR (F-018)                                                                                                                                                    |

---

## 4. Inventario y almacén

| Botón                                | Server Action             | Permiso               | Efecto                                                                                                              |
| ------------------------------------ | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Nuevo insumo**                     | `createInsumo(input)`     | `inventory:write`     | `INSERT insumos`; código generado por `fn_siguiente_codigo_insumo` (contador por tenant)                            |
| **Editar** (fila)                    | `updateInsumo(input)`     | `inventory:write`     | `UPDATE insumos`                                                                                                    |
| **Importar** (masiva)                | `createInsumosBulk(rows)` | `inventory:write`     | Alta por lotes; devuelve `BulkImportResult` con éxitos y fallos por fila                                            |
| **Ver lotes** → **Nuevo lote**       | `createLote(input)`       | `inventory:write`     | ⭐ Aplica **merma de recepción**: guarda cantidad neta y coste unitario neto. Código por `fn_siguiente_codigo_lote` |
| **Stock out**                        | `stockOut(input)`         | `inventory:stock_out` | `fn_descontar_insumo_fefo` con `idempotency_key` obligatoria                                                        |
| **Registrar merma**                  | `registrarMerma(input)`   | `inventory:merma`     | `fn_registrar_merma`, atómica (cierre de F-022)                                                                     |
| **Actualizar** (`inventory.refresh`) | `getInsumos()`            | `inventory:read`      | Recarga la tabla                                                                                                    |

---

## 5. Requisiciones (cocina → almacén)

| Botón                  | Acción                        | Permiso                   | Efecto                                                                                   |
| ---------------------- | ----------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| **Pedir insumos**      | `createRequisicion(input)`    | `requisiciones:create`    | Requisición + ítems, ligada al turno activo. Emite `REQUISICION_ESTADO` a `sala:almacen` |
| **Alistar**            | `alistarRequisicion(id, v)`   | `requisiciones:despachar` | `solicitada → en_alistamiento`                                                           |
| **Despachar**          | `despacharRequisicion(input)` | `requisiciones:despachar` | `en_alistamiento → despachada`, con cantidades reales por ítem                           |
| **Confirmar recibido** | `confirmarRecibido(id, v)`    | `requisiciones:confirmar` | `despachada → recibida`. Valida que **el área** coincida con el rol                      |
| **Cancelar**           | `cancelarRequisicion(id, v)`  | `requisiciones:cancel`    | Solo desde `solicitada`                                                                  |

Las cuatro transiciones simples pasan por el helper común `transicionar()`, que centraliza
`assertCan` → `findById` → `guardArea` → caso de uso → `auditLog` → `emitEstado`. Sin
duplicación.

---

## 6. Turnos

| Botón                     | Acción                | Permiso        | Efecto                                                                                                             |
| ------------------------- | --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Iniciar turno**         | `iniciarTurno(input)` | `turnos:write` | `INSERT turnos` con `teamlider` **obligatorio** y `bloque`. Emite `TURNO_EVENTO` a `sala:admin` (🔵 nadie escucha) |
| **Cerrar turno / activo** | `cerrarTurno(id)`     | `turnos:write` | `cerrado_at`, `activo=false`, `cierre_motivo`                                                                      |

El `TurnoGuard` del layout **bloquea toda la operación** hasta que hay turno abierto. No es
un aviso: es una barrera.

---

## 7. Administración

| Pantalla       | Botón                     | Acción                                  | Permiso                                                                                 |
| -------------- | ------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| Proveedores    | Nuevo / Editar            | `createProveedor` / `updateProveedor`   | `proveedores:write`                                                                     |
| Proveedores    | **Eliminar / Desactivar** | `deleteProveedor(id)`                   | `proveedores:write` — _soft delete_ (`deleted_at`)                                      |
| Personal       | Crear                     | `crearPersonal(input)`                  | `users:write`                                                                           |
| Personal       | Activar/Desactivar        | `togglePersonal(id, activo)`            | `users:write` — ⭐ invalida la sesión en el siguiente `assertCan`                       |
| Personal       | Cambiar rol               | `cambiarRolPersonal(id, rol)`           | `users:write`                                                                           |
| Personal       | Eliminar                  | `eliminarPersonal(id)`                  | `users:write`                                                                           |
| Tenants        | Nuevo tenant              | `crearTenant(input)`                    | `tenants:write` (solo superuser)                                                        |
| Tenants        | Activar/Desactivar        | `toggleTenant(id, activo)`              | idem                                                                                    |
| Tenant detalle | Crear usuario             | `crearUsuario(input)`                   | idem                                                                                    |
| Tenant detalle | Toggle / cambiar rol      | `toggleUser` / `cambiarRolUsuario`      | idem                                                                                    |
| Alertas        | **Marcar todas**          | `marcarTodasLeidas()`                   | `alertas:read`                                                                          |
| Alertas        | Marcar una                | `marcarAlertaLeida(id)`                 | `alertas:read`                                                                          |
| Alertas        | Disparar checks           | `checkVencimientos` / `checkDemoraAmex` | `alertas:write` / `cocina_amex:read`                                                    |
| Analítica      | **Refrescar vistas**      | `refreshAnalytics()`                    | `analytics:refresh` — permiso propio, no incluido en `analytics:read` (cierre de F-020) |
| QR             | Generar / Imprimir        | `generateQRLink(input)`                 | `orders:create`                                                                         |

---

## 8. Autenticación

| Botón                        | Handler                       | Efecto                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iniciar sesión**           | `iniciarSesion(credenciales)` | Rate limit `login` (5/15 min **por cuenta**, no por IP — corregido en `dffaa17` porque el bucket por IP bloqueaba a toda la sala) + Turnstile + `signInWithPassword` con `options.captchaToken`. Al éxito, `router.push(getSafeNext(next, role))` |
| **Ojo / mostrar contraseña** | estado local                  | Alterna `type` del input                                                                                                                                                                                                                          |
| **Cerrar sesión** (sidebar)  | `supabase.auth.signOut()`     | `router.refresh()` + `router.push('/login')`                                                                                                                                                                                                      |
| **Cambiar idioma**           | `LocaleSwitcher`              | Cookie de locale + recarga dura (la traducción se resuelve en servidor)                                                                                                                                                                           |
| **Cambiar tema**             | `ThemeToggle`                 | `next-themes`; el script inline lleva nonce de CSP (`0d853cd`)                                                                                                                                                                                    |

---

## 9. Botón sin backend real

| Botón / panel                        | Dónde         | Problema                                                                                                                            |
| ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Actualizar** de `SolicitudesPanel` | `/pasteleria` | Llama a `getSolicitudesCocina()`, que devuelve `ok([])` de forma incondicional. El botón funciona; la lista nunca tendrá contenido. |

Es el único caso en el repositorio de control de UI sin respaldo funcional. No hay ningún
botón que llame a una acción inexistente ni ninguna acción de escritura sin `assertCan`.
