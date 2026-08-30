# 18 · Funcionalidades parcialmente terminadas

Para cada una: **qué existe · qué funciona · qué falta · ficheros · qué la bloquea · trabajo
necesario.**

---

## P-1 · Analítica y reportes · ⚫ 20 % — **la más grave**

### Qué existe

Módulo hexagonal completo (`domain`, `application`, `ports`, `infrastructure`, `actions`),
página `/analytics`, componentes `AnalyticsPanel` y `ConsumoTable`, vista materializada
`mv_consumo_vs_produccion_turno`, vista filtrada por tenant, RPC de refresco con permiso
propio y una suite de RLS.

### Qué funciona

- El refresco (`refresh_analytics_views`) — probado por `f005_analytics_refrescable`.
- La vista materializada se puebla correctamente.
- El permiso `analytics:refresh` está separado de `analytics:read` (F-020).
- `AnalyticsPanel` recibe y **muestra** el error, así que el fallo es visible, no silencioso.

### Qué falla

**Cuatro defectos independientes, los dos primeros verificados ejecutando SQL:**

**1. `permission denied` para todo rol autenticado.**

La migración `20260527000000_enterprise_audit_fixes.sql` hace dos cosas incompatibles entre sí:

```sql
CREATE OR REPLACE VIEW public.v_consumo_vs_produccion_turno_tenant
WITH (security_invoker = true) AS                          -- ← privilegios del LLAMANTE
SELECT * FROM public.mv_consumo_vs_produccion_turno
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

REVOKE SELECT ON public.mv_consumo_vs_produccion_turno FROM authenticated;  -- ← le quita ese privilegio
```

Con `security_invoker = true` la vista **no** aísla al llamante de la tabla subyacente:
comprueba sus privilegios sobre ella. Al revocarlos, la vista queda inutilizable.

Reproducción sobre la base reconstruida con las 80 migraciones:

```
SELECT test.login('aaaaaaaa-0000-0000-0000-000000000001');   -- admin real del seed
SELECT current_user, auth.jwt()->'app_metadata'->>'role';    -- authenticated | admin
SELECT * FROM public.v_consumo_vs_produccion_turno_tenant LIMIT 1;
→ ERROR: permission denied for materialized view mv_consumo_vs_produccion_turno
```

**2. Cero filas para el superuser.**

`fetchConsumoVsProduccion` usa `scope = ctx.role === 'superuser' ? null : ctx.tenantId`, y con
`null` el repositorio consulta con `createAdminClient()` (`service_role`). Ese rol **sí** puede
leer la vista materializada, pero su JWT no lleva `app_metadata.tenant_id`, así que el `WHERE`
de la vista se evalúa a `NULL` y descarta todo:

```
filas en mv_consumo_vs_produccion_turno            → 1
filas vistas como service_role sin claim de tenant → 0
```

**3. Sin refresco programado.** `cron.job` contiene solo `check-alertas` y
`cerrar-turnos-expirados`. La vista solo se actualiza si un admin pulsa "Refrescar vistas".

**4. Alcance menor que el prometido.** `CLAUDE.md` promete filtros por _turno, nodo,
responsable y período_. La vista solo tiene dimensiones `turno` × `insumo`. **No existen las
dimensiones nodo ni responsable**, así que esos filtros no pueden implementarse sin rehacer la
vista.

### Ficheros

`supabase/migrations/20260527000000_enterprise_audit_fixes.sql` (76-89) ·
`20260822000006_mv_refresh_inicial.sql` · `modules/analytics/**` ·
`app/(dashboard)/analytics/page.tsx` · `components/analytics/`

### Bloqueo

Un conflicto entre dos decisiones de la misma migración. La prueba `f005` cubre el refresco,
no la lectura, y por eso el defecto sobrevivió a la remediación forense.

### Trabajo necesario

1. **Una línea**: recrear la vista **sin** `security_invoker` (queda como _security definer_,
   propiedad de `postgres`, que sí puede leer la MV) — o, alternativamente, devolver el
   `GRANT SELECT` sobre la MV a `authenticated`. La primera opción es la correcta: mantiene el
   aislamiento que se buscaba.
2. Para el superuser: usar una vista sin filtro accesible solo a `service_role`, o pasar el
   tenant como parámetro en lugar de leerlo del JWT.
3. Añadir un `cron.schedule` de refresco (p. ej. cada 15 min).
4. Añadir una prueba de RLS que **lea** la vista como `authenticated`, no solo que la refresque.
5. Decidir si se amplía la vista con nodo y responsable o se corrige `CLAUDE.md`.

---

## P-2 · Alertas en tiempo real · 🟡 55 %

### Qué existe

Motor de checks, tabla `alertas`, deduplicación, enrutado por tipo a canal, `AlertasBell` con
contador y panel, `AlertasAdminPanel`, cron cada 5 min.

### Qué funciona

Generación, deduplicación, persistencia, autenticación del cron, marcado de leídas, y la
consulta bajo demanda (al montar el componente y al abrir el panel).

### Qué falla

**`AlertasBell` nunca se une a ningún canal.** El componente registra
`socket.on('event', handle)` pero no hay ni una llamada a `socket.emit('join', …)`. El
servidor difunde con `io.to(`${tenantId}:${channel}`)`, de modo que un socket sin sala no
recibe nada.

Además, de los cinco canales de destino de alertas
(`sala:admin`, `sala:almacen`, `sala:cocina:fria`, `sala:cocina:caliente`, `sala:cocina:amex`),
**solo dos tienen algún cliente unido**, y ninguno de ellos escucha `ALERTA`.

### Ficheros

`components/alertas/alertas-bell.tsx` · `modules/alertas/domain/canales.ts` ·
`apps/socket-server/src/lib/emit-handler.ts`

### Trabajo necesario

Añadir en `AlertasBell` un `useEffect` que se una a los canales que correspondan al rol del
usuario (y haga `leave` al desmontar). Añadir una prueba que verifique que todo componente que
escucha un evento se une al canal donde ese evento se emite.

---

## P-3 · Tiempo real de los pedidos QR · 🟡 70 %

### Qué existe / funciona

El alta por QR es completa y está bien blindada. El evento `PEDIDO_CREADO` se emite.

### Qué falla

Solo se emite a `CHANNELS.COCINA`. El alta interna (`createPedido`) emite además a
`COCINA_AMEX` y `COCINA_PASTELERIA` según las áreas implicadas. Un postre pedido por QR **no
despierta la pantalla de pastelería**; un plato AMEX pedido por QR no despierta el KDS de AMEX.

### Ficheros

`app/qr/[locale]/actions.ts` (bloque final de emisión) frente a
`modules/orders/actions.ts:275-281`

### Trabajo necesario

Reutilizar en el camino QR la misma lógica de canales que ya existe en `createPedido`.
Idealmente extraerla a una función compartida para que no vuelva a divergir.

---

## P-4 · Modo offline del personal · 🟡 40 %

### Qué existe

Cola en IndexedDB (`lib/offline/queue.ts`), sincronización con reintentos y abandono tras 3
intentos (`sync.ts`), hook `useOfflineSync`, y **dos** banners de conectividad.

### Qué funciona

Todo ello — **pero solo para el pasajero del QR**. `QrPassengerApp` es el único consumidor de
`enqueueOrder`.

### Qué falla

El `OfflineBanner` del **dashboard** usa `useOfflineSync()`, que lee la cola de pedidos del
QR. Para un empleado, `pendingCount` siempre vale 0: el banner solo funciona como indicador de
"sin conexión". **No existe cola offline para las operaciones del personal.**

`CLAUDE.md`, regla 6, dice: _"Idempotencia offline: Stock Out, despacho y tickets requieren
`idempotency_key` siempre"_. Las claves de idempotencia **sí existen** en las tres
operaciones — la mitad del trabajo está hecha —, pero no hay cola que las aproveche cuando cae
la red.

### Ficheros

`lib/offline/*` · `components/layout/offline-banner.tsx` ·
`components/qr/qr-passenger-app.tsx`

### Trabajo necesario

Generalizar la cola para que acepte operaciones arbitrarias (no solo `PedidoQRInput`) y
conectar Stock Out, merma y despacho. La infraestructura de idempotencia ya está lista en base.

---

## P-5 · Solicitudes de preparación a pastelería · 🔵 10 %

### Qué existe

`SolicitudesPanel` (componente completo, con socket, tabla y toast), el evento
`SOLICITUD_PREPARACION` en el contrato, el canal `sala:broadcast:cocina` con su ACL, el
esquema `solicitarPreparacionSchema` y la acción `getSolicitudesCocina`.

### Qué falla

La acción devuelve `ok([])` de forma incondicional; el mecanismo que la alimentaba
(`mensajes_chat`) se eliminó en el refoco de 2026-05-28. **Nadie emite el evento y nadie
escribe los datos.**

### Trabajo necesario

Decidir: implementar el flujo con una tabla propia, o retirar el panel, el evento, el canal y
el esquema. Hoy ocupa espacio en `/pasteleria` sin aportar nada.

---

## P-6 · Derecho de supresión (GDPR / Habeas Data) · 🟡 60 %

### Qué existe / funciona

Endpoint `/api/gdpr/forget` con sesión, rate limit fail-closed de 3/día, registro en
`audit_log`, anonimización del email en Supabase Auth y cierre de sesión. Banner de Habeas
Data y retención de 90 días.

### Qué falla

No toca `public.users.nombre`, que es el nombre que se muestra en la interfaz y el que
enlazan `turnos.responsable_id`, `pedidos.responsable_id` y `audit_log.user_id`.

### Trabajo necesario

Extender la anonimización a `public.users` respetando la inmutabilidad de `audit_log` (que no
debe reescribirse: su valor probatorio depende del hash chain).

---

## P-7 · Gestión del ciclo de vida de las recetas · 🟡 70 %

### Qué existe / funciona

Alta de receta, alta de ingredientes, edición de metadatos de menú, toggle de disponibilidad.

### Qué falla

No hay acción para **editar** una receta existente (nombre, porciones, rendimiento, zona), ni
para **quitar** un ingrediente ya añadido, ni para **eliminar** una receta. La columna
`recetas.deleted_at` existe pero ninguna acción la escribe.

### Trabajo necesario

Tres acciones nuevas (`updateReceta`, `removeIngrediente`, `deleteReceta`) con su UI. El
permiso (`recipes:write`) y las políticas RLS ya lo permiten.

---

## P-8 · Ajuste y conteo de inventario · 🟡 30 %

### Qué existe

El ENUM `tipo_movimiento` incluye `ajuste` y `conteo`; la vista de analítica agrega
`total_ajustes`.

### Qué falla

**No hay ninguna UI ni Server Action que genere movimientos de tipo `ajuste` o `conteo`.** El
inventario físico no puede reconciliarse desde la aplicación.

### Trabajo necesario

Pantalla de conteo cíclico y acción de ajuste, con el mismo patrón de idempotencia que
`stockOut`.

---

## P-9 · Almacenamiento de imágenes · 🟡 30 %

### Qué existe

`recetas.imagen_url` (texto), renderizado en la carta AMEX y en el QR, campo editable en el
formulario de metadatos.

### Qué falla

`CLAUDE.md` lista Supabase Storage en el stack, pero **no hay una sola llamada a
`supabase.storage`** en el repositorio. La URL se pega a mano. No hay subida, ni validación de
tipo, ni redimensionado, ni control de acceso sobre la imagen.

### Trabajo necesario

Un bucket con política de acceso, un componente de subida y validación de tipo y tamaño. O
bien retirar Storage del stack documentado.

---

## Resumen

| ID  | Funcionalidad                 | %   | Bloqueo principal                                 |
| --- | ----------------------------- | --- | ------------------------------------------------- |
| P-1 | Analítica y reportes          | 20  | Conflicto `security_invoker` vs `REVOKE` en la MV |
| P-2 | Alertas en tiempo real        | 55  | Falta el `join` al canal                          |
| P-3 | Tiempo real de pedidos QR     | 70  | Emite a un solo canal                             |
| P-4 | Modo offline del personal     | 40  | La cola solo sirve al QR del pasajero             |
| P-5 | Solicitudes a pastelería      | 10  | Backend eliminado, UI superviviente               |
| P-6 | Derecho de supresión          | 60  | No anonimiza `public.users.nombre`                |
| P-7 | Ciclo de vida de recetas      | 70  | Faltan editar, quitar ingrediente y eliminar      |
| P-8 | Ajuste y conteo de inventario | 30  | Sin UI ni acción                                  |
| P-9 | Almacenamiento de imágenes    | 30  | Storage documentado pero sin usar                 |
