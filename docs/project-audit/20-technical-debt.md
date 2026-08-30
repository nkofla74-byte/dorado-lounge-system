# 20 · Deuda técnica

Formato: **problema · ubicación · impacto · riesgo · prioridad · solución recomendada.**

Los cinco hallazgos con prefijo `H-` son defectos funcionales encontrados en esta auditoría.
Los `DT-` son deuda estructural.

---

## 🔴 Críticos

### H-A · La vista de analítica es ilegible para todo rol autenticado

| Campo     | Detalle                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación | `supabase/migrations/20260527000000_enterprise_audit_fixes.sql`, líneas 76-89                                                                                                                                                                                                                                                                      |
| Problema  | La vista se crea `WITH (security_invoker = true)` y la **misma migración** ejecuta `REVOKE SELECT ON public.mv_consumo_vs_produccion_turno FROM authenticated`. Con `security_invoker`, la vista comprueba los privilegios del llamante sobre la tabla subyacente; al revocarlos, queda inutilizable.                                              |
| Impacto   | `/analytics` devuelve `permission denied` a **cualquier** rol autenticado, admin incluido                                                                                                                                                                                                                                                          |
| Riesgo    | Una de las 21 pantallas del producto no funciona. Los KPIs operacionales, que son el argumento de venta del módulo de costes, no se pueden consultar                                                                                                                                                                                               |
| Evidencia | Reproducido ejecutando SQL sobre la base con las 80 migraciones aplicadas (ver `23-evidence-index.md`)                                                                                                                                                                                                                                             |
| Prioridad | **Máxima**                                                                                                                                                                                                                                                                                                                                         |
| Solución  | Recrear la vista **sin** `security_invoker` (queda como _security definer_, propiedad de `postgres`, que sí puede leer la MV). Alternativa peor: devolver el `GRANT SELECT` sobre la MV a `authenticated`, pero eso reabre el acceso directo sin filtro de tenant que la migración quería cerrar. **Y añadir una prueba de RLS que lea la vista.** |

### H-B · La analítica del superuser devuelve siempre cero filas

| Campo     | Detalle                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación | `modules/analytics/infrastructure/analytics-repository.ts` (rama `tenantId === null`) + `modules/analytics/actions.ts`                                                                                                                               |
| Problema  | El camino cross-tenant usa `createAdminClient()` (`service_role`), que sí puede leer la MV, pero cuyo JWT no contiene `app_metadata.tenant_id`. El `WHERE tenant_id = (auth.jwt()…)::uuid` de la vista se evalúa a `NULL` y descarta todas las filas |
| Impacto   | El God Mode analítico muestra una tabla vacía sin error, que es peor que un error: parece que no hay datos                                                                                                                                           |
| Evidencia | Con 1 fila real en la MV, la consulta como `service_role` devuelve 0                                                                                                                                                                                 |
| Prioridad | **Máxima**                                                                                                                                                                                                                                           |
| Solución  | Consultar la MV directamente (no la vista filtrada) en el camino de superuser, o pasar el tenant como parámetro explícito en lugar de leerlo del JWT                                                                                                 |

---

## 🟠 Altos

### H-C · La campana de alertas no se une a ningún canal

| Campo     | Detalle                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación | `components/alertas/alertas-bell.tsx`                                                                                                                                                                             |
| Problema  | Registra `socket.on('event', handle)` para eventos `ALERTA` pero nunca ejecuta `socket.emit('join', canal)`. El servidor difunde con `io.to(`${tenantId}:${channel}`)`, así que un socket sin sala no recibe nada |
| Impacto   | Las alertas de vencimiento, stock mínimo y demora AMEX **no llegan en tiempo real a nadie**. El usuario solo las ve al recargar o al abrir el panel                                                               |
| Riesgo    | En una sala 24/7 con producto perecedero, un aviso de vencimiento diferido pierde su razón de ser                                                                                                                 |
| Prioridad | Alta                                                                                                                                                                                                              |
| Solución  | `useEffect` que se una a los canales correspondientes al rol y haga `leave` al desmontar. **Y una prueba que verifique que todo componente que escucha un evento se une al canal donde ese evento se emite**      |

### H-D · La vista materializada de analítica no tiene refresco programado

| Campo     | Detalle                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Ubicación | Ninguna migración agenda su refresco; `cron.job` contiene solo `check-alertas` y `cerrar-turnos-expirados`  |
| Impacto   | Aun corregido H-A, la analítica mostrará datos congelados desde el último clic manual en "Refrescar vistas" |
| Prioridad | Alta                                                                                                        |
| Solución  | `SELECT cron.schedule('refresh-analytics','*/15 * * * *','SELECT public.refresh_analytics_views()')`        |

### H-E · El alta de pedidos por QR emite a un solo canal

| Campo     | Detalle                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación | `app/qr/[locale]/actions.ts` (bloque final) vs `modules/orders/actions.ts:275-281`                                                                  |
| Problema  | El QR emite `PEDIDO_CREADO` solo a `CHANNELS.COCINA`; el alta interna emite además a `COCINA_AMEX` y `COCINA_PASTELERIA` según las áreas del pedido |
| Impacto   | Un postre pedido por QR no despierta la pantalla de pastelería; un plato AMEX no despierta el KDS de AMEX                                           |
| Prioridad | Alta                                                                                                                                                |
| Solución  | Extraer la lógica de canales de `createPedido` a una función compartida y usarla en ambos caminos                                                   |

### DT-01 · El check de stock mínimo no cubre los caminos principales de consumo

| Campo     | Detalle                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ubicación | `modules/inventory/actions.ts:240` — única invocación de `checkStockMinimo`                                                                                                                                                   |
| Problema  | Solo se dispara tras `stockOut`. No se dispara en `entregarPedido` (el descuento ocurre dentro de `fn_entregar_pedido`, en Postgres, fuera del alcance de una función TS), ni en `registrarMerma`, ni en `fn_completar_tanda` |
| Impacto   | El stock puede caer bajo mínimo durante un servicio normal sin generar alerta                                                                                                                                                 |
| Prioridad | Alta                                                                                                                                                                                                                          |
| Solución  | Añadir un `runCheckStockMinimo(tenantId)` de barrido al cron de 5 min. No depender de que cada camino de escritura invoque el check                                                                                           |

---

## 🟡 Medios

### DT-02 · Código muerto del refoco operacional

| Elemento                                                                                     | Ubicación                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `getSolicitudesCocina()` → `ok([])` incondicional                                            | `production/actions.ts:263`              |
| `SolicitudesPanel`, renderizado en `/pasteleria`                                             | `components/production/`                 |
| Evento `SOLICITUD_PREPARACION` (consumidor sin emisor)                                       | `socket-events.ts`                       |
| Eventos `STOCK_OUT` y `DESPACHO` (ni emisor ni consumidor)                                   | `socket-events.ts`                       |
| Canales `sala:cocina:fria`, `sala:cocina:caliente`, `sala:broadcast:cocina` (sin un extremo) | `socket-events.ts`                       |
| Eventos `PEDIDO_COCINERO` y `TURNO_EVENTO` (emisor sin consumidor)                           | `orders/actions.ts`, `turnos/actions.ts` |
| 8 esquemas Zod sin consumidor                                                                | `shared-validation/src/index.ts`         |
| `mv_cogs_per_passenger` en `refresh_analytics_views`                                         | Postgres                                 |
| ENUM `tipo_acceso_sala` sin tabla que lo use                                                 | Postgres                                 |

**Impacto:** `socket-events.ts` es la _fuente de verdad declarada_ del contrato de tiempo real.
Hoy describe un sistema que no existe: quien lo lea creerá que hay 11 canales y 10 eventos en
funcionamiento cuando solo 7 canales y 4 eventos están conectados de extremo a extremo.
**Prioridad:** media. **Solución:** retirar lo muerto; decidir el destino de las solicitudes
de preparación.

### DT-03 · Cobertura de pruebas concentrada en el 8,5 % del código

91,53 % suena excelente, pero el `include` de `vitest.config.ts` abarca 2 279 de las 26 644
líneas de producción de `apps/web/src`. Los 15 297 renglones de componentes React no tienen
ninguna prueba funcional. **Los cinco hallazgos de esta auditoría caen, sin excepción, fuera
del alcance de cobertura.** Prioridad: media. Solución: incorporar Testing Library para los
flujos críticos y ampliar el `include` a `infrastructure/`.

### DT-04 · Páginas de administración sin `assertCan`

`/admin/costos` y `/admin/turnos` dependen únicamente de la whitelist del middleware; sus
acciones usan permisos (`recipes:read`, `turnos:read`) que otros roles poseen. No es
explotable hoy —el middleware es una barrera de servidor— pero rompe el patrón de dos capas.
Prioridad: media. Solución: añadir `assertCan` a nivel de página, como ya hacen `/admin/qr`,
`/admin/alertas` y `/admin/proveedores`.

### DT-05 · Fuente de verdad duplicada en la navegación

`NAV_ITEMS` en `sidebar.tsx` replica a mano `ROLE_ALLOWED_PREFIXES` de `lib/auth/role-home.ts`.
El comentario dice _"mantener sincronizado"_; no hay prueba que detecte la deriva. Un enlace
visible hacia una ruta que el middleware bloquea produce un rebote confuso.
Prioridad: media. Solución: derivar `NAV_ITEMS` de la matriz, o añadir una prueba de
coherencia (existe el precedente de `rbac-sql.test.ts`).

### DT-06 · Ciclo de vida incompleto de las recetas

No hay acción de editar receta, quitar ingrediente ni eliminar receta; `recetas.deleted_at`
existe y nadie lo escribe. Una receta mal creada solo se corrige por SQL.
Prioridad: media.

### DT-07 · Supresión de datos personales incompleta

`/api/gdpr/forget` anonimiza `auth.users.email` pero deja `public.users.nombre`, que es el
dato visible en la interfaz. Riesgo regulatorio (Habeas Data, Ley 1581 de Colombia).
Prioridad: media. Solución: extender la anonimización a `public.users` sin tocar `audit_log`,
cuya inmutabilidad es lo que le da valor probatorio.

### DT-08 · Supabase Storage documentado pero sin usar

`CLAUDE.md` lo lista en el stack; no hay una sola llamada a `supabase.storage`. Las imágenes
son URLs de texto pegadas a mano, renderizadas con `<img>` crudo.
Prioridad: media. Solución: implementar la subida o retirar Storage del stack documentado.

### DT-09 · `next lint` deprecado

Emite el aviso _"will be removed in Next.js 16"_. Bloquea la actualización mayor.
Prioridad: media. Solución: `npx @next/codemod@canary next-lint-to-eslint-cli .`

### DT-10 · Los paquetes compartidos no se lintan

`packages/shared-types` y `packages/shared-validation` tienen `eslint` como devDependency pero
**no declaran script `lint`**, así que `pnpm lint --if-present` los salta. Son la fuente de
verdad de los contratos entre web y socket.
Prioridad: media. Solución: añadir el script.

---

## ⚪ Bajos

| ID    | Problema                                                                                                 | Ubicación                                  | Solución                                                     |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| DT-11 | Contraseña mínima de 8 caracteres sin requisitos de composición                                          | `crearUsuarioSchema`                       | Endurecer la política                                        |
| DT-12 | `assertSesionVigente()` consulta `users` en cada una de las 81 acciones, sin caché                       | `lib/auth/assertCan.ts`                    | Caché con TTL corto (30-60 s)                                |
| DT-13 | `render.yaml` sigue declarando `SUPABASE_JWT_SECRET`, ya no obligatoria y pendiente de rotación (F-027)  | `render.yaml`                              | Retirarla y rotar la clave                                   |
| DT-14 | `lib/supabase/admin.ts` sin `import 'server-only'`                                                       | `lib/supabase/admin.ts`                    | Añadirlo: convierte la convención en garantía del compilador |
| DT-15 | Política `alertas_update_permiso` usa `alertas:read` para `UPDATE`                                       | `20260822000003_politicas_por_permiso.sql` | Restringir el UPDATE a la columna `leida`                    |
| DT-16 | `audit_log` y `domain_events` conservan grants de INSERT/UPDATE/DELETE                                   | Postgres                                   | Revocar; los triggers quedan como segunda capa               |
| DT-17 | Textos multiidioma hardcodeados en el banner offline del QR                                              | `components/qr/offline-banner.tsx`         | Usar next-intl (`fr.json` y `pt.json` ya existen)            |
| DT-18 | Componentes y acciones sobredimensionados: `qr-passenger-app.tsx` (1 389 L), `orders/actions.ts` (944 L) | varios                                     | Dividir por caso de uso                                      |
| DT-19 | Cronómetros a 1 Hz por tarjeta en los KDS                                                                | `pedido-card.tsx`, `kds-board-amex.tsx`    | Un solo temporizador compartido por tablero                  |
| DT-20 | 226 kB de JS compartido; `/inventario` 363 kB sobre tabletas de sala                                     | `build`                                    | Carga diferida de los diálogos pesados                       |
| DT-21 | `let query: any` en el repositorio de analítica                                                          | `analytics-repository.ts`                  | Tipar la consulta                                            |
| DT-22 | Alertas de check por evento con `void` (fire-and-forget): un fallo se pierde sin rastro                  | `inventory/actions.ts:240,373`             | Registrar el fallo o reintentar desde el barrido             |
| DT-23 | `lotes.proveedor` (texto libre) coexiste con `lotes.proveedor_id` (FK)                                   | Postgres                                   | Migrar y retirar la columna de texto                         |

---

## Deuda documental — ver `23-evidence-index.md`

Nueve contradicciones entre `CLAUDE.md` y el código, entre ellas el rol `chef` con su ruta
`/cocina` inexistente y el TTL del token QR (4 h documentadas, 12 h reales).

---

## Resumen por prioridad

| Prioridad     | Cantidad | Elementos                            |
| ------------- | -------: | ------------------------------------ |
| 🔴 Crítica    |        2 | H-A, H-B                             |
| 🟠 Alta       |        4 | H-C, H-D, H-E, DT-01                 |
| 🟡 Media      |        9 | DT-02 … DT-10                        |
| ⚪ Baja       |       13 | DT-11 … DT-23                        |
| 📄 Documental |        9 | Contradicciones `CLAUDE.md` ↔ código |
