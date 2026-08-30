# 05 · Pantallas y rutas

**24 páginas + 4 route handlers.** El `build` de producción generó **29 rutas**; la salida
literal se reproduce al final.

Leyenda de guardias:

- **MW** = whitelist de rutas del middleware (`ROLE_ALLOWED_PREFIXES`)
- **AC** = `assertCan()` en el propio `page.tsx`
- **AA** = `assertCan()` dentro de las acciones que la página invoca

---

## 1. Rutas públicas (sin sesión)

| Ruta             | Fichero                     | Propósito                                       |
| ---------------- | --------------------------- | ----------------------------------------------- |
| `/login`         | `app/(auth)/login/page.tsx` | Formulario de acceso con Turnstile              |
| `/qr/[locale]`   | `app/qr/[locale]/page.tsx`  | Carta digital del pasajero (es/en/fr/pt), PWA   |
| `/health`        | `app/health/route.ts`       | Healthcheck; devuelve `{status:"ok"}`           |
| `/api/heartbeat` | route handler               | Ping a Better Stack. Exige `Bearer CRON_SECRET` |
| `/api/cron/*`    | route handler               | Checks de alertas. Exige `Bearer CRON_SECRET`   |

`PUBLIC_PATHS` = `['/login','/qr','/api/cron','/api/heartbeat','/health']`, con coincidencia
**por segmento completo**, no por prefijo de cadena (cierre de F-029, 4 pruebas).

### Comprobado en ejecución

```
GET /health        → 200  {"status":"ok","service":"dorado-web",…}
GET /login         → 200  (HTML)
GET /qr/es         → 200  (HTML)
GET /              → 302  → /login?next=%2F
GET /inventario    → 302  → /login?next=%2Finventario
GET /api/heartbeat → 500  {"error":"SERVER_MISCONFIGURED"}   (sin CRON_SECRET · correcto)
POST /api/gdpr/forget → 302 → /login?next=… (ruta no pública · correcto)
```

---

## 2. Raíz

| Ruta | Fichero        | Comportamiento                                                    |
| ---- | -------------- | ----------------------------------------------------------------- |
| `/`  | `app/page.tsx` | Sin sesión → `/login`. Con sesión → `redirect(getRoleHome(role))` |

---

## 3. Dashboard — grupo `(dashboard)`

Layout común: `Sidebar` + `MobileTopBar` + `OfflineBanner` + `SocketProvider` + `TurnoGuard`.

| #   | Ruta                        | Rol principal            | Guardia                            | Qué muestra y qué se puede hacer                                                                                                                                              |
| --- | --------------------------- | ------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/inventario`               | admin                    | MW + AA                            | Hub con pestañas **Inventario** y **Almacén**. Tabla de insumos con stock, alta/edición, importación masiva, hoja de lotes, stock out, merma. Cola de requisiciones embebida. |
| 2   | `/almacen`                  | personal_almacen         | MW + AA                            | Pantalla de operación de bodega ordenada por urgencia: atención (stock bajo, vencimientos), requisiciones, bodega, proveedores.                                               |
| 3   | `/recetas`                  | admin, chefs, pastelería | MW + AA                            | Tabla de recetas con coste calculado, alta de receta, hoja de ingredientes, metadatos de menú QR, toggle 86/disponible.                                                       |
| 4   | `/produccion`               | steward, chefs, admin    | MW + AA                            | Tandas de producción: crear, iniciar, completar, cancelar.                                                                                                                    |
| 5   | `/pasteleria`               | personal_pasteleria      | MW + AA                            | Tandas + KDS de área pastelería + `SolicitudesPanel` (🔵 siempre vacío).                                                                                                      |
| 6   | `/cocina-caliente`          | chef_cocina_caliente     | MW + **AC**                        | KDS de área: cola de ítems, despacho por ítem, sección de requisiciones.                                                                                                      |
| 7   | `/cocina-fria`              | chef_cocina_fria         | MW + **AC**                        | Idéntica, para el área fría.                                                                                                                                                  |
| 8   | `/cocina-amex`              | sous_chef                | MW + **AC**                        | KDS AMEX: cronómetro por pedido, trazabilidad completa, alertas de demora.                                                                                                    |
| 9   | `/pedidos`                  | mesero_amex, admin       | MW + AA                            | Pestañas **Pedidos** / **Carta**. Tomar pedido, confirmar entrega.                                                                                                            |
| 10  | `/snack`                    | personal_snack           | MW + **AC**                        | Vista de zona: pedidos por elaboración; descuento al entregar.                                                                                                                |
| 11  | `/buffet`                   | personal_buffet          | MW + **AC**                        | Idéntica, zona buffet.                                                                                                                                                        |
| 12  | `/analytics`                | admin, superuser         | MW + AA                            | ⚫ **Consumo vs producción por turno. Hoy muestra error o vacío** (ver `20-technical-debt.md` H-A/H-B).                                                                       |
| 13  | `/admin/costos`             | admin                    | **solo MW**                        | Coste por receta desde `fn_costo_receta`.                                                                                                                                     |
| 14  | `/admin/proveedores`        | admin, personal_almacen  | MW + **AC**                        | CRUD de proveedores + historial de compras.                                                                                                                                   |
| 15  | `/admin/alertas`            | admin                    | MW + **AC**                        | Panel de alertas del tenant: marcar leídas, disparar checks.                                                                                                                  |
| 16  | `/admin/trazabilidad`       | admin                    | solo MW + AA (`orders:trace`)      | Trazabilidad de pedidos: quién, cuándo, qué ítem.                                                                                                                             |
| 17  | `/admin/turnos`             | admin                    | **solo MW**                        | Historial de turnos, filtros, cierre.                                                                                                                                         |
| 18  | `/admin/personal`           | admin                    | MW + comprobación de rol explícita | Alta de personal, activar/desactivar, cambiar rol, eliminar.                                                                                                                  |
| 19  | `/admin/qr`                 | admin                    | MW + **AC**                        | Generador de códigos QR de mesa (`generateQRLink`).                                                                                                                           |
| 20  | `/admin/tenants`            | superuser                | MW + comprobación de rol           | God Mode: listado y alta de tenants.                                                                                                                                          |
| 21  | `/admin/tenants/[tenantId]` | superuser                | MW + comprobación de rol           | Detalle de tenant + panel de usuarios.                                                                                                                                        |

**Además**, 15 ficheros `loading.tsx` con skeletons, `error.tsx` de grupo, `global-error.tsx`
y `not-found.tsx`. Buena higiene de estados de carga y error.

### Hueco de defensa en profundidad (no explotable hoy)

`/admin/costos`, `/admin/turnos` y `/admin/trazabilidad` **no llaman `assertCan()` a nivel de
página**. Descansan en la whitelist del middleware. Para `/admin/trazabilidad` la acción exige
`orders:trace` (solo admin), así que hay segunda capa. Para las otras dos, las acciones usan
permisos que otros roles poseen (`recipes:read`, `turnos:read`): la única barrera es el
middleware. Sigue siendo una barrera de servidor y no hay ruta que la eluda, pero rompe el
patrón de dos capas del resto del sistema. Registrado como **DT-04**.

---

## 4. Ruta documentada que no existe

`CLAUDE.md` mantiene esta fila en su tabla de UIs por rol:

| Rol    | Ruta principal | UI                                              |
| ------ | -------------- | ----------------------------------------------- |
| `chef` | `/cocina`      | KDS supervisor: vista combinada Caliente + Fría |

**No existe `/cocina` en el repositorio**, y el rol `chef` está explícitamente marcado como
deprecado en `packages/shared-types/src/enums.ts`: sigue inerte en el ENUM SQL por datos
históricos, pero ya no es asignable ni navegable. La tabla de `CLAUDE.md` no se actualizó.
Ver [`23-evidence-index.md` · Contradicciones](./23-evidence-index.md).

---

## 5. Salida literal del `build`

```
Route (app)                                 Size  First Load JS
┌ ƒ /                                      382 B         226 kB
├ ƒ /_not-found                            382 B         226 kB
├ ƒ /admin/alertas                       5.48 kB         261 kB
├ ƒ /admin/costos                        5.03 kB         256 kB
├ ƒ /admin/personal                      6.44 kB         321 kB
├ ƒ /admin/proveedores                   1.31 kB         305 kB
├ ƒ /admin/qr                            14.7 kB         264 kB
├ ƒ /admin/tenants                       3.82 kB         302 kB
├ ƒ /admin/tenants/[tenantId]            4.87 kB         325 kB
├ ƒ /admin/trazabilidad                   4.4 kB         285 kB
├ ƒ /admin/turnos                        4.91 kB         256 kB
├ ƒ /almacen                             1.01 kB         349 kB
├ ƒ /analytics                           4.84 kB         285 kB
├ ƒ /api/cron/check-alertas                351 B         232 kB
├ ƒ /api/gdpr/forget                       351 B         232 kB
├ ƒ /api/heartbeat                         381 B         226 kB
├ ƒ /buffet                                341 B         333 kB
├ ƒ /cocina-amex                         6.96 kB         275 kB
├ ƒ /cocina-caliente                       343 B         313 kB
├ ƒ /cocina-fria                           343 B         313 kB
├ ƒ /health                                382 B         226 kB
├ ƒ /inventario                          7.85 kB         363 kB
├ ƒ /login                               5.71 kB         251 kB
├ ƒ /pasteleria                          1.89 kB         344 kB
├ ƒ /pedidos                             12.4 kB         268 kB
├ ƒ /produccion                            738 B         321 kB
├ ● /qr/[locale]                         13.4 kB         246 kB
│   ├ /qr/es  ├ /qr/en  ├ /qr/fr  └ /qr/pt
├ ƒ /recetas                             10.1 kB         323 kB
└ ƒ /snack                                 342 B         333 kB
+ First Load JS shared by all             226 kB
ƒ Middleware                              155 kB
```

**Observación de rendimiento.** `/inventario` (363 kB) y `/almacen` (349 kB) son las rutas
más pesadas, y son precisamente las que se operan con guantes sobre tabletas en una red de
aeropuerto. 226 kB de JS compartido es alto para el caso de uso. Ver
[`16-code-quality.md §Rendimiento`](./16-code-quality.md).
