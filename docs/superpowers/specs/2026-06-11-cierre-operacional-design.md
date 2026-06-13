# Spec — Cierre operacional: Snack/Buffet, Requisiciones, Auditoría de turnos

**Fecha:** 2026-06-11
**Estado:** Aprobada en diseño (pendiente plan de implementación)
**Enfoque elegido:** A — extender módulos existentes, 3 frentes incrementales

## Contexto

Auditoría de lo construido contra la necesidad real del negocio (actores descritos por el dueño del producto el 2026-06-11). Resultado:

| Necesidad                                                       | Estado                                                                           | Veredicto               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| Superadmin crea/activa/desactiva tenants                        | `superuser` + `/admin/tenants`                                                   | ✅ Existe               |
| Admin audita pedidos, costos, alertas, personal                 | `/admin/trazabilidad`, `/admin/costos`, `/admin/personal`, `/analytics`          | ✅ Mayormente           |
| Admin ve turnos: quién trabajó, qué produjo cada área por turno | Tabla `turnos` existe, **sin vista de auditoría**                                | ⚠️ Gap → Frente 3       |
| Usuarios AMEX/Snack/Buffet piden a cocina                       | Solo `mesero_amex`; zonas `snack`/`buffet` existen en ruteo pero sin roles ni UI | ⚠️ Gap → Frente 1       |
| Cocina pide insumos a almacén, despacho inmediato               | No existe nada                                                                   | ❌ Gap mayor → Frente 2 |
| Descuento automático al elaborar recetas                        | `fn_descontar_insumo_fefo` en tandas y entregas                                  | ✅ Existe               |
| QR AMEX → pedidos directos a cocina AMEX                        | `/qr/[locale]` con Server Actions                                                | ✅ Existe               |

## Decisiones tomadas con el dueño del producto

1. **Requisición cocina→almacén = solo coordinación/trazabilidad.** No mueve inventario. El stock se descuenta únicamente vía receta (Principio Rector). Se descartó stock por ubicación y descuento directo al despachar.
2. **Snack y Buffet tienen UI dedicada** (`/snack`, `/buffet`), no reutilizan la pantalla `/pedidos`.
3. **Dos tipos de receta ya modelados cubren los dos tipos de pedido:** platos AMEX = recetas tipo `servicio`; elaboraciones snack/buffet (arroz, chuleta valluna, pollo…) = recetas tipo `produccion` con cantidades estandarizadas.
4. **Auditoría de turnos: ambas** — vista dedicada `/admin/turnos` con drill-down + sección de turnos en `/analytics`.

## Orden de entrega

Cada frente = rama `feature/` + PR propio, deployable por separado.

1. **Frente 1 — Snack & Buffet** (cierra actores faltantes)
2. **Frente 2 — Requisiciones cocina → almacén**
3. **Frente 3 — Auditoría de turnos** (al final: así también audita requisiciones)

---

## Frente 1 — Snack & Buffet: UI dedicada, pedidos por elaboración

### Contratos (`packages/shared-types` primero)

- Roles nuevos: `personal_snack`, `personal_buffet` en `UserRole`.
- Canales nuevos: `sala:snack`, `sala:buffet` en `CHANNELS` + entradas en `CHANNEL_ACL`. Las zonas no se hablan entre sí (topología ARCHITECTURE.md §10): cada rol solo se une a su canal; admin/superuser a todos.

### Auth y routing

- `ROLE_HOME`: `personal_snack → /snack`, `personal_buffet → /buffet`.
- `ROLE_ALLOWED_PREFIXES`: cada rol solo su ruta.
- `lib/auth/permissions.ts`: `orders:create`, `orders:deliver` y permisos de lectura para los roles nuevos.

### Pedidos por elaboración (extiende módulo `orders`, sin módulo nuevo)

- Catálogo de `/snack` y `/buffet`: recetas tipo `produccion` cuya `area_produccion` ∈ `ZONA_AREAS_PERMITIDAS[zona]`. Cantidad del ítem = número de tandas estándar de la receta.
- Ruteo por ítem al KDS del área: ya existe, sin cambios.
- Trazabilidad pedido↔producción: columna nueva `tandas_produccion.pedido_item_id uuid NULL` (FK a `pedido_items`). La tanda producida para un pedido queda vinculada al ítem que la originó.

### Regla anti-doble-descuento (Principio Rector)

El FEFO se ejecuta **una sola vez, al completar la tanda** (`fn_completar_tanda`, ya atómico e idempotente). La confirmación de entrega de un ítem cuya receta es tipo `produccion` **no descuenta** — solo registra el evento de trazabilidad. Los platos tipo `servicio` (AMEX) siguen descontando al confirmar entrega, como hoy. Test unitario obligatorio para este caso.

### UI (componentes compartidos, dos rutas con zona fija)

1. **Pedir** — catálogo de elaboraciones de su zona.
2. **Pedidos activos** — estado por ítem en tiempo real (Socket.io, canal de su zona).
3. **Disponibilidad** — tandas de producción vigentes antes de pedir.
4. **Historial del turno** — pedidos del turno activo con estado final.
5. **Métricas de zona** — pedidos del turno, tiempos de entrega, consumo de la zona.

Strings vía next-intl (es/en), sin hardcodear.

---

## Frente 2 — Requisiciones cocina → almacén

### Módulo hexagonal nuevo: `requisiciones`

Estructura rígida `domain → application → infrastructure → actions.ts`. Server Actions con Zod + `assertCan` + `auditLog`.

### Datos (migración idempotente, RLS, `tenant_id NOT NULL`)

- `requisiciones`: `area_solicitante` (enum `AreaProduccion`: `cocina_caliente` | `cocina_fria` | `amex` | `pasteleria`), `solicitada_por`, `turno_id`, `estado`, `version` (optimistic locking), timestamps por transición, `deleted_at`.
- `requisicion_items`: `insumo_id`, `cantidad_solicitada`, `cantidad_despachada` (numeric(12,4); permite despacho parcial), unidad.
- `requisicion_eventos`: log append-only (mismo patrón que `pedido_eventos`; trigger bloquea UPDATE/DELETE).
- **Cero movimientos de inventario.** Es coordinación pura; el stock solo se mueve vía receta.

### Estados

`solicitada → en_alistamiento → despachada → recibida`. Cancelable solo en `solicitada`. Transiciones con optimistic locking (`.eq('version', …)`).

### UI

- En cada KDS (caliente, fría, AMEX, pastelería): panel "Pedir insumos" — crear requisición y confirmar recibido.
- En `/almacen`: cola "Requisiciones de cocina" en tiempo real — alistar → despachar.

### Real-time

- Evento nuevo `REQUISICION_ESTADO` en shared-types.
- Canal nuevo `sala:almacen` (hoy almacén no tiene canal) + ACL: `personal_almacen`, `admin`, `superuser`.
- Persistencia primero, broadcast después.

### Alertas

Extensión del motor `alertas`: requisición sin despachar > umbral → notifica Admin + Almacén (vía cron de checks existente).

### Permisos

- `requisiciones:create`: chefs de área + pastelería (+ admin).
- `requisiciones:despachar`: `personal_almacen`, `admin`.
- `requisiciones:confirmar`: cualquier usuario con rol de cocina cuyo rol corresponda al `area_solicitante` de la requisición (no solo quien la creó — los turnos rotan), `admin`.

---

## Frente 3 — Auditoría de turnos

### `/admin/turnos` (solo admin/superuser)

- Lista de turnos: usuario, rol, teamlider, login/logout, abierto/cerrado. Filtros: período, rol, responsable, teamlider.
- Drill-down por turno: tandas producidas por área, pedidos, requisiciones, movimientos de inventario y alertas vinculados a ese turno.
- Solo lectura — Supabase server client directo (patrón permitido para lecturas), sin Server Actions de escritura.

### `/analytics` ampliado

Sección de KPIs por turno — el dominio `analytics/domain/kpi.ts` ya soporta `turnoId` como filtro; se proyecta en UI con los filtros obligatorios (turno, nodo, responsable, período).

---

## Testing

- **Unit (domain, coverage 90%+):** transiciones de estado de requisiciones; ruteo de elaboraciones por zona; **entrega de ítem `produccion` no invoca FEFO** (anti-doble-descuento).
- **Integration:** Server Actions nuevos con `assertCan` + `auditLog` + Zod.
- **E2E (Playwright):** (1) snack pide elaboración → KDS produce tanda → entrega sin doble descuento; (2) requisición completa cocina → almacén → recibida.

## Fuera de alcance (YAGNI)

- Stock por ubicación / sub-bodegas por cocina.
- Rol `recepcion` (sigue pendiente; no está en la lista de actores del cierre).
- Notificaciones fuera de la app (el sistema es solo in-app).
- Cambios al flujo AMEX existente (mesero, QR, KDS AMEX) — ya cumplen la necesidad.

## Riesgos y mitigaciones

| Riesgo                                             | Mitigación                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Doble descuento en elaboraciones (tanda + entrega) | Regla explícita por `tipo_receta` + test unitario obligatorio                                      |
| Canal socket nuevo mal configurado → desconexiones | `CHANNEL_ACL` actualizado en shared-types antes de tocar server/web; test de ACL                   |
| Drift multi-tenant                                 | Tablas nuevas con `tenant_id NOT NULL` + RLS desde la migración inicial; diseño asume varias salas |
| Regresión en `/pedidos` AMEX al extender `orders`  | Catálogo por tipo de receta es aditivo; suite existente de orders debe seguir verde                |
