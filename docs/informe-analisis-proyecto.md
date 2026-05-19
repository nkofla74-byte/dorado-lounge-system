# Informe de analisis tecnico, errores y vulnerabilidades

Fecha: 2026-05-18  
Proyecto: Dorado Lounge System  
Alcance revisado: monorepo completo, excepto `node_modules`, `.next`, `coverage` y binarios.

## 1. Resumen ejecutivo

Dorado Lounge System es un monorepo PNPM para operar salas VIP aeroportuarias. Tiene una app web Next.js 15, un servidor Socket.IO independiente, paquetes compartidos de tipos/validacion, migraciones Supabase/Postgres y scripts operativos.

La arquitectura general esta bien orientada para un monolito modular: hay separacion por bounded contexts en `apps/web/src/modules`, RLS en base de datos, Server Actions para mutaciones, eventos realtime aislados por tenant y funciones SQL para operaciones atomicas de inventario. Sin embargo, hay problemas que hoy bloquean o debilitan produccion:

- La app web no pasa `typecheck`.
- Hay una inconsistencia entre el flujo AMEX `recibido_cocina` y la funcion SQL que valida transiciones de pedidos.
- El QR publico puede crear pedidos sin rate limit ni Turnstile.
- El cambio de rol de usuarios puede dejar JWT claims incompletos.
- El audit de dependencias reporta 2 vulnerabilidades moderadas.
- La configuracion de entorno del socket tiene nombres inconsistentes entre `.env.example` y el codigo.

## 2. Comandos ejecutados

| Comando                                                           | Resultado                                                                                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `git status --short`                                              | Hay cambios sin confirmar previos; no se revirtieron.                                               |
| `rg --files`                                                      | 325 archivos bajo `apps`, 30 bajo `supabase`, 12 bajo `scripts`, 12 bajo `packages`, 5 bajo `docs`. |
| `pnpm --recursive --if-present test`                              | Pasa.                                                                                               |
| `pnpm --recursive --if-present typecheck`                         | Falla en `@dorado/web`.                                                                             |
| `pnpm audit --prod`                                               | 2 vulnerabilidades moderadas.                                                                       |
| `git check-ignore -v apps/web/.env.local apps/socket-server/.env` | Ambos `.env` locales estan ignorados por Git.                                                       |

## 3. Estructura carpeta por carpeta

### Raiz

- `package.json`: define el workspace, scripts globales (`dev`, `build`, `test`, `lint`, `typecheck`) y overrides de seguridad para `fast-uri` y `postcss`.
- `pnpm-workspace.yaml` / `pnpm-lock.yaml`: controlan los paquetes del monorepo.
- `.env.example`: documenta variables para web, socket, observabilidad, cron, Turnstile y Upstash.
- `.gitignore`: ignora `.env*`, `node_modules`, `.next`, coverage y similares.
- `render.yaml`: despliegue del socket server en Render.
- `ARCHITECTURE.md` / `CLAUDE.md`: documentacion tecnica y operacional del sistema.

### `apps/web`

App principal Next.js 15 con App Router.

- `src/app`: rutas, layouts, dashboard, login, QR publico y APIs internas.
- `src/modules`: dominio por contexto. Cada modulo suele tener `domain`, `application`, `infrastructure`, `tests` y `actions.ts`.
- `src/components`: UI por feature y componentes base.
- `src/lib`: utilidades transversales: Supabase, auth/RBAC, audit log, socket, offline, rate limit, QR token, i18n.
- `e2e`: pruebas Playwright por flujo operativo.
- `public`: PWA manifest y service worker.

### `apps/socket-server`

Servicio Node/Socket.IO.

- `src/index.ts`: levanta HTTP `/health`, endpoint interno `POST /emit` y Socket.IO con CORS.
- `src/lib/auth.ts`: valida JWT de Supabase durante el handshake y aplica ACL por canal.
- `src/lib/emit-handler.ts`: endpoint interno para emitir eventos desde Server Actions.
- `src/tests/auth.test.ts`: pruebas de handshake y ACL.

### `packages/shared-types`

Fuente compartida de enums y contratos.

- `src/enums.ts`: roles, estados de pedidos/tandas, transiciones.
- `src/socket-events.ts`: canales, ACL y payloads realtime.
- `src/domain-events.ts`: contratos de eventos de dominio.

### `packages/shared-validation`

Schemas Zod compartidos.

- `src/index.ts`: validaciones para inventario, recetas, pedidos, turnos, usuarios, proveedores, etc.

### `packages/eslint-config`

Configuracion compartida de ESLint.

### `supabase`

Modelo de datos, RLS, triggers, funciones y seed.

- `migrations/0001_*`: tenants, users, roles y claims.
- `migrations/0003_*` a `0008_*`: inventario, recetas, pedidos, operaciones, realtime, RPC FEFO.
- `migrations/0010_*`, `security_hardening`, `search_path`: invariantes y hardening.
- Migraciones posteriores: costos, proveedores, alertas, pg_cron, roles extendidos, pedidos AMEX, almacen.
- `seed.sql`: datos iniciales y usuarios de prueba.

### `scripts`

Scripts administrativos para seed/reset de usuarios, reparacion de metadata y configuracion de secrets GitHub.

## 4. Como funciona el sistema

1. El usuario inicia sesion con Supabase Auth en `/login`.
2. El JWT contiene `app_metadata.role` y `app_metadata.tenant_id`.
3. `middleware.ts` enruta segun rol y bloquea rutas no permitidas.
4. Las Server Actions llaman `assertCan(permission)` para validar sesion real con `supabase.auth.getUser()`.
5. Las lecturas/escrituras normales usan Supabase anon + RLS.
6. Operaciones privilegiadas o atomicas usan `createAdminClient()` con `service_role`.
7. Inventario descuenta stock con `fn_descontar_insumo_fefo`, que usa FEFO, locks `FOR UPDATE` e idempotencia.
8. Las acciones persisten datos y luego emiten eventos al socket server por `POST /emit`.
9. El socket server valida JWT en handshake, fuerza ACL por canal y aisla rooms por `tenantId:channel`.
10. El QR publico usa tokens firmados con `JWT_PASSENGER_SECRET`, no Supabase Auth.

## 5. Hallazgos criticos

### C1. La app web no pasa typecheck

Archivo: `apps/web/src/app/qr/[locale]/layout.tsx:21`

Next 15 tipa `params` como promesa en layouts dinamicos generados. El archivo declara:

```ts
params: {
  locale: string;
}
```

El error real de `tsc` indica que `params` llega como `Promise<{ locale: string }>`. Esto bloquea `pnpm --filter @dorado/web typecheck` y puede bloquear build/CI.

Impacto: despliegues no confiables, deuda de compatibilidad con Next 15.

Recomendacion: cambiar la firma a `params: Promise<{ locale: string }>` y hacer `const { locale } = await params`.

### C2. El flujo AMEX `recibido_cocina` esta aceptado en TypeScript pero rechazado por SQL

Archivos:

- `packages/shared-types/src/enums.ts:98`
- `apps/web/src/modules/orders/actions.ts:116`
- `apps/web/src/modules/cocina_amex/actions.ts:35`
- `supabase/migrations/20260505000000_security_hardening.sql:108`

El enum y el codigo ya contemplan `recibido_cocina`, pero la funcion SQL `validate_pedido_estado()` recreada en `security_hardening.sql` permite desde `creado` solo:

```sql
NEW.estado NOT IN ('en_preparacion', 'cancelado')
```

Eso deja fuera `recibido_cocina`. Si esa migracion corre despues de `20260514000002_pedido_eventos.sql`, la transicion AMEX `creado -> recibido_cocina` falla en base de datos.

Impacto: KDS AMEX puede romperse en produccion con errores 400/500 al recibir pedido.

Recomendacion: crear migracion correctiva que reemplace `validate_pedido_estado()` incluyendo:

- `creado -> recibido_cocina | en_preparacion | cancelado`
- `recibido_cocina -> en_preparacion | cancelado`

### C3. QR publico permite spam de pedidos

Archivo: `apps/web/src/app/qr/[locale]/actions.ts:100`

`createPedidoFromQR()` valida token de mesa, tenant y receta, pero no aplica rate limit ni Turnstile. Un token QR valido por 4 horas puede ser reutilizado para generar muchos pedidos con idempotency keys distintas.

Impacto: spam operativo, saturacion de cocina, ruido en auditoria, consumo de DB y potencial DoS funcional.

Recomendacion:

- Agregar bucket `qr_order` en `rate-limit.ts`.
- Exigir Turnstile en el primer pedido o por ventana.
- Rate limit por `tenantId + mesaNumero + IP`.
- Registrar intentos rechazados.

### C4. Cambio de rol puede romper `app_metadata.tenant_id`

Archivo: `apps/web/src/modules/superuser/infrastructure/superuser-repository.ts:160`

`updateUserRole()` actualiza Auth con:

```ts
app_metadata: {
  role;
}
```

Si Supabase reemplaza el objeto en vez de fusionarlo, se pierde `tenant_id`. El middleware y `assertCan()` requieren `role` y `tenant_id`, por lo que el usuario quedaria con sesion invalida.

Impacto: usuarios bloqueados tras cambiar rol; posible inconsistencia entre `public.users.role` y claims del JWT.

Recomendacion: leer `authData.user.app_metadata`, preservar `tenant_id` y actualizar con `{ ...appMeta, role, tenant_id: data.tenant_id }`.

### C5. El endpoint interno `/emit` no limita tamano de body ni valida contrato de evento

Archivo: `apps/socket-server/src/lib/emit-handler.ts:57`

El handler concatena chunks sin limite y parsea JSON sin schema. Aunque requiere `SOCKET_EMIT_SECRET`, cualquier llamada autorizada o filtracion del secreto podria emitir eventos arbitrarios a cualquier `tenantId/channel`.

Impacto: DoS por memoria, eventos falsos, bypass de contrato compartido.

Recomendacion:

- Limitar body, por ejemplo 64 KB.
- Validar `tenantId` UUID, `channel` contra `CHANNELS` y `event` contra schemas por tipo.
- Comparar secretos con `timingSafeEqual`.

## 6. Hallazgos altos

### A1. Inconsistencia de variable JWT del socket

Archivos:

- `.env.example:21`
- `apps/socket-server/src/index.ts:11`
- `render.yaml:23`

El ejemplo usa `SOCKET_JWT_SECRET`, pero el codigo y Render esperan `SUPABASE_JWT_SECRET`. Esto causa arranque fallido local si se copia `.env.example`.

Recomendacion: corregir `.env.example` y eliminar el nombre obsoleto.

### A2. `render.yaml` usa plan free para un servicio 24/7 con WebSockets

Archivo: `render.yaml:7`

El mismo archivo avisa que el plan free hiberna. Para Socket.IO en operacion aeroportuaria 24/7 esto no es aceptable.

Impacto: desconexiones, eventos realtime perdidos, falsa sensacion de disponibilidad.

Recomendacion: Render Starter o proveedor equivalente sin hibernacion.

### A3. El formulario de personal admin no contempla roles extendidos

Archivo: `apps/web/src/app/(dashboard)/admin/personal/actions.ts:12`

`adminRoleSchema` solo permite roles antiguos: `admin`, `chef`, `sous_chef`, `mesero_amex`, `personal_snack`, `personal_buffet`. Faltan `recepcion`, `personal_almacen`, `personal_pasteleria`, `steward`.

Impacto: el admin no puede crear ni reasignar parte del personal operativo definido en el sistema.

Recomendacion: sincronizar el schema local con `userRoleSchema`, excluyendo solo `superuser` si esa es la regla.

### A4. `estadoPedidoSchema` de validacion no incluye `recibido_cocina`

Archivo: `packages/shared-validation/src/index.ts:45`

El enum compartido de validacion omite `recibido_cocina`, aunque `shared-types` y el dominio lo usan. Puede romper futuros formularios/API que usen `transicionPedidoSchema`.

Recomendacion: incluir `recibido_cocina` o derivar validacion desde `shared-types` para evitar divergencia.

### A5. Lectura de usuarios de Auth limitada a 1000

Archivo: `apps/web/src/modules/superuser/infrastructure/superuser-repository.ts:87`

`listUsers({ perPage: 1000 })` no pagina. Si se superan 1000 usuarios, correos faltantes apareceran vacios.

Recomendacion: implementar paginacion o resolver emails por lote especifico.

## 7. Hallazgos medios

### M1. Auditoria es best-effort

Archivo: `apps/web/src/lib/audit.ts:20`

`auditLog()` captura errores y no bloquea la operacion principal. Esto mejora disponibilidad, pero contradice la promesa de auditoria fuerte para operaciones sensibles.

Recomendacion: separar niveles: auditoria obligatoria para inventario/usuarios/tenant, best-effort para eventos secundarios.

### M2. `getSession()` en middleware se usa solo para ruteo

Archivo: `apps/web/src/middleware.ts:119`

El comentario aclara que la validacion real ocurre con `getUser()` en Server Actions. Es aceptable para ruteo, pero no debe asumirse como frontera de seguridad.

Recomendacion: mantener esta regla documentada y nunca autorizar mutaciones solo desde middleware.

### M3. Rate limit fail-open en produccion si falta Upstash

Archivo: `apps/web/src/lib/rate-limit.ts:48`

Si no estan `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, el rate limiter permite todo.

Recomendacion: en produccion fallar cerrado para login/QR/cron, o validar env obligatoria al boot/deploy.

### M4. `CRON_SECRET` vacio puede generar comportamiento confuso

Archivos:

- `apps/web/src/app/api/cron/check-alertas/route.ts:20`
- `apps/web/src/app/api/heartbeat/route.ts:17`

Si `CRON_SECRET` no existe, el header esperado es `Bearer undefined`. No es una exposicion directa si nadie conoce eso, pero es mala configuracion silenciosa.

Recomendacion: responder 500 `SERVER_MISCONFIGURED` cuando falte `CRON_SECRET`.

### M5. El socket client mantiene singleton por primer token

Archivo: `apps/web/src/lib/socket/client.ts:18`

`getSocket(token)` reutiliza el socket aunque cambie el token. Si cambia usuario/tenant sin recargar totalmente, puede mantener credenciales antiguas.

Recomendacion: recrear socket cuando el token cambia.

## 8. Vulnerabilidades de dependencias

Resultado de `pnpm audit --prod`:

| Severidad | Paquete           | Ruta                                                                                | Problema                               | Version corregida |
| --------- | ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------- | ----------------- |
| Moderate  | `brace-expansion` | `@sentry/nextjs > @sentry/bundler-plugin-core > glob > minimatch > brace-expansion` | DoS por rangos numericos grandes       | `>=5.0.6`         |
| Moderate  | `ws`              | `socket.io > engine.io > ws`                                                        | Divulgacion de memoria no inicializada | `>=8.20.1`        |

Recomendacion:

- Actualizar dependencias directas que arrastran esas versiones.
- Si PNPM no resuelve automaticamente, agregar overrides especificos:
  - `brace-expansion: ">=5.0.6"`
  - `ws: ">=8.20.1"`
- Reejecutar `pnpm audit --prod`.

## 9. Seguridad positiva observada

- RLS esta habilitado en tablas multi-tenant principales.
- Las Server Actions usan `assertCan()` antes de mutar datos.
- `service_role` esta centralizado en `lib/supabase/admin.ts`.
- Las operaciones FEFO usan RPC con idempotencia y `FOR UPDATE`.
- Hay CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y HSTS en produccion.
- Los `.env` locales estan ignorados por Git.
- Socket.IO valida JWT en handshake y aplica ACL por canal.
- QR valida que las recetas pertenecen al tenant del token de mesa.

## 10. Riesgos por carpeta

| Carpeta                      | Riesgo principal                                            | Estado                        |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `apps/web/src/app`           | Compatibilidad Next 15, QR publico, cron secrets            | Requiere fixes                |
| `apps/web/src/modules`       | Divergencias entre dominio, validation y SQL                | Requiere sincronizacion       |
| `apps/web/src/lib`           | Rate limit fail-open, auditoria best-effort                 | Revisar para produccion       |
| `apps/socket-server/src`     | Body sin limite en `/emit`, audit deps                      | Requiere hardening            |
| `packages/shared-types`      | Bien como fuente de enums, pero no siempre seguida          | Sincronizar consumidores      |
| `packages/shared-validation` | Enums duplicados pueden quedar atrasados                    | Requiere ajuste               |
| `supabase/migrations`        | Migraciones posteriores pueden sobrescribir reglas antiguas | Requiere migracion correctiva |
| `scripts`                    | Scripts con passwords de prueba documentados                | Solo desarrollo               |
| `docs`                       | README casi vacio                                           | Mejorar onboarding            |

## 11. Prioridad recomendada

1. Arreglar `typecheck` de `apps/web`.
2. Crear migracion correctiva para `validate_pedido_estado()` con `recibido_cocina`.
3. Corregir `updateUserRole()` para preservar `tenant_id` en `app_metadata`.
4. Proteger `createPedidoFromQR()` con rate limit y Turnstile.
5. Actualizar dependencias vulnerables y reejecutar audit.
6. Corregir `.env.example` (`SUPABASE_JWT_SECRET`).
7. Endurecer `/emit` con limite de body y validacion de schema.
8. Sincronizar roles extendidos en admin personal.
9. Cambiar Render a plan sin hibernacion antes de produccion.
10. Mejorar README con instrucciones reales de instalacion, env y despliegue.

## 12. Estado final de verificacion

- Tests unitarios: pasan.
- Typecheck: falla en web por firma de `params` en layout QR.
- Audit de dependencias: 2 moderadas.
- Secret files locales: existen, pero estan ignorados por Git.
- No se hicieron cambios funcionales en codigo; este informe es el unico archivo agregado.
