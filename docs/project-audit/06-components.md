# 06 · Componentes

**78 componentes React** en `apps/web/src/components/`. Aquí se documentan los que llevan
lógica de negocio; los primitivos de shadcn/ui se listan al final.

Patrón general del repositorio: **el `page.tsx` es Server Component**, carga los datos con
Server Actions y los pasa como `initial*` al componente cliente, que a partir de ahí gestiona
su propio estado y refresco. Consistente en las 24 páginas.

---

## 1. KDS — pantallas de cocina

### `KdsBoardArea` · `components/kds/kds-board-area.tsx` · 193 L · 🟢

| Aspecto     | Detalle                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Props       | `area: AreaProduccion`, `titulo`, `subtitulo`, `initialPedidos`, `readOnly?`, `embedded?`                                   |
| Estado      | `pedidos: PedidoWithItems[]`                                                                                                |
| Socket      | Se une a `AREA_CHANNEL[area]`: `cocina_fria`/`cocina_caliente` → **`sala:cocina`**; `pasteleria` → `sala:cocina:pasteleria` |
| Escucha     | `PEDIDO_CREADO`, `PEDIDO_ESTADO`, `ITEM_ESTADO`                                                                             |
| Hijos       | `PedidoCard`                                                                                                                |
| Acciones    | Vía `PedidoCard` → `iniciarItem`, `marcarItemListo`, `recallItem`                                                           |
| Reutilizado | `/cocina-fria`, `/cocina-caliente`, `/pasteleria` (`embedded`)                                                              |

> Nota: los canales `sala:cocina:fria` y `sala:cocina:caliente` existen en `CHANNELS` y en el
> ACL, pero este componente **no** los usa: ambas áreas comparten `sala:cocina`. Se dejan sin
> uso alguno en toda la aplicación web.

### `KdsBoardAmex` · `components/kds/kds-board-amex.tsx` · 418 L · 🟢

Props `initialPedidos`, `readOnly?`. Contiene `AmexCard`, con cronómetro que recalcula cada
segundo (`setInterval` a 1 000 ms) y **actualización optimista** (`onOptimistic`) antes de
confirmar con el servidor. Se une a `CHANNELS.COCINA_AMEX` y hace `leave` al desmontar —el
único componente que limpia su suscripción correctamente. Escucha `PEDIDO_CREADO`,
`PEDIDO_ESTADO` (filtrando `zona === 'amex'`) e `ITEM_ESTADO`.

### `PedidoCard` · `components/kds/pedido-card.tsx` · 291 L · 🟢

El componente táctil central. Props: `pedido`, `area?`, `pedidoVersion?`, `onRefresh?`,
`readOnly?`. Sin `area` muestra todos los ítems en solo lectura.

- `useElapsed(since)` — cronómetro vivo, 1 s.
- `nivelUrgencia()` — `normal` / `aviso` (>8 min) / `critico` (>15 min).
- Colores por token de tema (`senal-*`, `zona-*`), no por paleta cruda de Tailwind: mantienen
  contraste en claro y oscuro.
- Botones: **Iniciar ítem**, **Marcar listo**, **Recall**. Feedback con `sonner`.

### `area-estado.ts`

Helper puro que deriva el estado agregado de un área a partir de sus ítems. Sin dependencias.

---

## 2. Inventario y almacén

| Componente              | L   | Rol                                                                                                                                            |
| ----------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `InventarioView`        | 78  | Hub con pestañas Inventario / Almacén. Solo para admin; el resto ve la tabla directa.                                                          |
| `InsumoTable`           | 314 | Tabla de insumos: búsqueda, orden, stock, semáforo de mínimo. Abre los diálogos.                                                               |
| `AlmacenPanel`          | —   | Panel de bodega para el rol almacén.                                                                                                           |
| `AlmacenOperacionPanel` | 230 | Pantalla de `/almacen` recompuesta **por urgencia real**: atención → requisiciones → bodega → proveedores. Cuatro `<section aria-labelledby>`. |
| `LotesSheet`            | —   | Hoja lateral con los lotes de un insumo; alta de lote con proveedor, coste y vencimiento.                                                      |
| `CreateInsumoDialog`    | —   | Alta de insumo.                                                                                                                                |
| `EditInsumoDialog`      | —   | Edición; valida con `updateInsumoSchema` en cliente **y** servidor.                                                                            |
| `NuevoIngresoDialog`    | —   | Flujo combinado: crea insumo si no existe + crea lote.                                                                                         |
| `BulkImportDialog`      | —   | Importación masiva → `createInsumosBulk`, devuelve `BulkImportResult`.                                                                         |
| `StockOutDialog`        | —   | Salida de stock → `stockOut` → `fn_descontar_insumo_fefo`, con `idempotency_key`.                                                              |
| `MermaDialog`           | —   | Registro de merma → `fn_registrar_merma`, atómica.                                                                                             |

---

## 3. Pedidos y zonas

| Componente               | L   | Rol                                                                                                                                                   |
| ------------------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PedidosView`            | 82  | Pestañas Pedidos / Carta según rol. Pestaña por defecto: admin→pedidos, mesero→carta.                                                                 |
| `PedidoTable`            | —   | Tabla de pedidos con estado, zona, mesa, acciones de transición.                                                                                      |
| `CartaAmex`              | —   | Carta visual con foto por plato; toggle 86/disponible para quien tenga `recipes:write`.                                                               |
| `ZonaView`               | 312 | Vista genérica de Snack/Buffet. Props: `zona`, `elaboraciones`, `initialPedidos`, `initialTandas`, `initialTurnoPedidos`. Se une al canal de su zona. |
| `CreatePedidoZonaDialog` | —   | Alta de pedido desde zona → `createPedido`.                                                                                                           |

---

## 4. Producción, recetas, proveedores

| Componente                                                  | Estado | Nota                                                                                                                               |
| ----------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `TandaTable`                                                | 🟢     | Listado y transiciones de tandas.                                                                                                  |
| `CreateTandaDialog`                                         | 🟢     | → `createTanda`.                                                                                                                   |
| `ProduccionDashboard`                                       | 🟢     | Resumen de producción del turno.                                                                                                   |
| `SolicitudesPanel`                                          | 🔵     | **Nunca mostrará datos.** Recibe `fetchSolicitudes`, que resuelve a `[]` fijo, y escucha `SOLICITUD_PREPARACION`, que nadie emite. |
| `RecipeTable`                                               | 🟢     | Recetas + coste por lote (`getCostosRecetas`).                                                                                     |
| `CreateRecipeDialog`                                        | 🟢     | Unión discriminada por `tipoReceta` en Zod.                                                                                        |
| `IngredientsSheet`                                          | 🟢     | Añadir ingredientes; editar metadatos de menú QR.                                                                                  |
| `ProveedoresPanel` · `ProveedorDialog` · `HistorialCompras` | 🟢     | CRUD y compras por proveedor.                                                                                                      |

---

## 5. Requisiciones

| Componente                   | Estado | Nota                                                                                                                                                                                |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RequisicionesPanel`         | 🟢     | Cola del almacén. **Sí hace `socket.emit('join', CHANNELS.ALMACEN)`** y refresca al recibir `REQUISICION_ESTADO`. Es el mejor ejemplo de tiempo real bien cableado del repositorio. |
| `RequisicionesCocinaSection` | 🟢     | Sección embebida en los KDS de cocina.                                                                                                                                              |
| `PedirInsumosDialog`         | 🟢     | Recibe `InsumoOption[]`; → `createRequisicion`.                                                                                                                                     |

---

## 6. Administración y plataforma

| Componente                                                                 | L   | Nota                                                                                                                                                      |
| -------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PersonalPanel` · `CrearPersonalDialog`                                    | —   | Alta/baja/rol de personal del tenant.                                                                                                                     |
| `TenantsPanel` · `CrearTenantDialog` · `UsersPanel` · `CrearUsuarioDialog` | —   | God Mode del superuser.                                                                                                                                   |
| `TrazabilidadPanel`                                                        | 311 | Tabla con filas expandibles; `ExpandedRow` carga `getTrazaPedido(id)` bajo demanda (lazy, evita N+1 en el listado).                                       |
| `AnalyticsPanel`                                                           | 169 | ⚫ Props `initialConsumo`, `turnos`, `showTenant`, `error`. **Recibe y muestra el error de base**, así que el fallo es visible al usuario, no silencioso. |
| `ConsumoTable`                                                             | —   | Tabla de consumo vs producción.                                                                                                                           |
| `CostosPanel`                                                              | —   | Coste por receta.                                                                                                                                         |
| `AlertasAdminPanel`                                                        | —   | Gestión de alertas; disparo manual de checks.                                                                                                             |
| `AlertasBell`                                                              | 🔵  | **Ver hallazgo H-C**: escucha `ALERTA` sin unirse a ningún canal.                                                                                         |
| `TurnosPanel` · `TurnoGuard`                                               | 157 | `TurnoGuard` bloquea la operación hasta abrir turno; exige `teamlider`.                                                                                   |

---

## 7. QR del pasajero

| Componente           | L    | Nota                                                                                                                                                                                |
| -------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QrPassengerApp`     | 940+ | El componente más grande del repositorio. Carta, carrito, envío, cola offline. Único consumidor de `enqueueOrder`.                                                                  |
| `QrGeneratorClient`  | —    | Genera e imprime QR de mesa (`generateQRLink`).                                                                                                                                     |
| `OfflineBanner` (qr) | —    | ⚠️ **Textos en 4 idiomas hardcodeados en un objeto `TEXTS`**, no vía next-intl, pese a que existen `fr.json` y `pt.json` con el namespace `qr`. Incumple la regla 7 de `CLAUDE.md`. |
| `SwRegister`         | —    | Registro del service worker de la PWA.                                                                                                                                              |

---

## 8. Layout, tema, diseño

`Sidebar` + `MobileTopBar` (navegación filtrada por rol vía `NAV_ITEMS`, espejo manual de
`ROLE_ALLOWED_PREFIXES`), `LocaleSwitcher`, `OfflineBanner` (dashboard), `ThemeProvider`,
`ThemeToggle`, `HabeasDataBanner`, `KdsOrderCard` (referencia de diseño).

**Duplicación de fuente de verdad detectada:** `NAV_ITEMS` en `sidebar.tsx` replica a mano la
matriz `ROLE_ALLOWED_PREFIXES` de `lib/auth/role-home.ts`. El propio comentario lo admite
("mantener sincronizado"). No hay prueba que detecte la deriva. Registrado como **DT-05**.

---

## 9. Primitivos de UI (shadcn/ui) — 21 componentes

`alert` · `avatar` · `badge` · `button` · `card` · `dialog` · `dropdown-menu` · `form` ·
`input` · `label` · `select` · `separator` · `sheet` · `skeleton` · `switch` · `tab-bar` ·
`table` · `table-skeleton` · `textarea` · `tooltip` · `turnstile-widget`

**`button.tsx` lleva una decisión de accesibilidad deliberada y comentada**: suelo de 44 px
en todas las variantes ("es de seguridad, no de estética"). El sistema de diseño del proyecto
sube el objetivo táctil a **56 px** en KDS y almacén porque se opera con guantes.

`tab-bar.tsx` es una unificación reciente: tres barras de pestañas escritas a mano se
consolidaron en un componente con contrato ARIA completo (commits `008a50b`, `503734b`).

---

## 10. Pruebas de componentes

Solo dos ficheros de prueba tocan la capa visual, y ambos verifican **contratos de diseño**,
no comportamiento:

| Fichero                                        | Pruebas | Qué comprueba                                     |
| ---------------------------------------------- | ------- | ------------------------------------------------- |
| `components/design/tests/contraste.test.ts`    | 29      | Ratios de contraste de los tokens, claro y oscuro |
| `components/design/tests/hig-contract.test.ts` | 11      | Objetivos táctiles y contrato HIG                 |

**No existe una sola prueba de renderizado o interacción de componentes** (Testing Library o
equivalente). Los 78 componentes están fuera de cobertura funcional. El propio tracker de
remediación lo reconoce en el riesgo residual de F-023. Ver
[`14-testing.md`](./14-testing.md).
