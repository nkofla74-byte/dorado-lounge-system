# Architecture Improvements

**Fecha:** 2026-05-27  
**Commit:** `e7722df`

---

## 1. Atomicidad de operaciones criticas

**Antes:** `completarTanda` hacia N llamadas a `fn_descontar_insumo_fefo` + 1 UPDATE al estado, todo en operaciones Supabase separadas. Un fallo entre la deduccion FEFO y el cambio de estado dejaba stock decrementado sin tanda completada.

**Despues:** RPC `fn_completar_tanda` ejecuta toda la operacion en una sola transaccion Postgres. Si cualquier ingrediente falla, se hace rollback completo. La tanda no cambia de estado hasta que todos los ingredientes estan deducidos.

**Impacto:** Viola el Principio Rector ("nada sale sin receta") ya no es posible. El inventario es consistente incluso bajo fallos parciales.

---

## 2. Materialized views con aislamiento de tenant

**Antes:** Las vistas materializadas (`mv_cogs_per_passenger`, `mv_consumo_vs_produccion_turno`, `mv_ocupacion_diaria`) eran accesibles directamente por cualquier usuario `authenticated`. No soportan RLS nativamente.

**Despues:** Se crearon vistas intermedias (`v_*_tenant`) con filtro `WHERE tenant_id = JWT.tenant_id` y `security_invoker = true`. Se revoco `SELECT` directo a las mat views para el rol `authenticated`. El codigo de analytics y flights fue actualizado para usar las vistas filtradas.

**Impacto:** KPIs financieros y datos de ocupacion aislados por tenant sin cambiar la logica de refresh de las mat views.

---

## 3. Maquina de estados de pedidos corregida

**Antes:** `PEDIDO_TRANSITIONS['creado']` incluia `en_preparacion`, permitiendo saltar `recibido_cocina`. El KDS AMEX depende de la transicion completa para medir tiempos de respuesta de cocina.

**Despues:** El flujo es estricto: `creado → recibido_cocina → en_preparacion → despachado → entregado`. Cancelacion posible desde `creado`, `recibido_cocina`, `en_preparacion`.

**Impacto:** Trazabilidad AMEX completa. Los KPIs de tiempo de preparacion son precisos.

---

## 4. Secretos fuera de pg_settings

**Antes:** `CRON_SECRET` almacenado en `ALTER DATABASE postgres SET app.cron_secret` — legible por cualquier usuario autenticado via `current_setting()`.

**Despues:** Funcion `fn_get_cron_secret()` (SECURITY DEFINER, REVOKE FROM PUBLIC/authenticated) lee de Supabase Vault con fallback a pg_settings. El cron job usa la funcion en lugar de `current_setting()` directo.

**Impacto:** El secret solo es accesible por `service_role` via la funcion. Post-deploy: migrar a Vault y limpiar pg_settings.

---

## 5. CI/CD como gate de produccion

**Antes:** `deploy.yml` se disparaba en `push: main` en paralelo con `ci.yml`. Un push con tests fallidos podia deployar a produccion.

**Despues:** `deploy.yml` usa `workflow_run: CI completed` — solo deploya si todos los jobs de CI (lint, typecheck, test, e2e, audit) pasaron. Se añadio `concurrency: group` para prevenir deploys simultaneos.

**Impacto:** Zero-downtime deploy garantizado. Nunca mas codigo roto en produccion por race condition de CI.

---

## 6. QR layout como nested route (no como app independiente)

**Antes:** El QR layout renderizaba su propio `<html><head><body>`, anidado dentro del root layout de Next.js. HTML invalido con dos elementos `<html>`.

**Despues:** El QR layout es un wrapper con `ThemeProvider` (storageKey separado `dorado-qr-theme`) y `NextIntlClientProvider`. Hereda `<html>` y `<body>` del root layout.

**Impacto:** HTML5 valido. Accesibilidad correcta. Sin parsing quirks en browsers mobiles.

---

## Decisiones tecnicas

| Decision                                          | Justificacion                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Advisory lock vs FOR UPDATE en audit_log          | Advisory lock es mas simple que FOR UPDATE con self-join. Serializa inserts per-tenant sin contention entre tenants.  |
| REVOKE mat views + crear vistas filtradas         | Mas seguro que confiar en que el codigo siempre filtre. Defensa en profundidad.                                       |
| Vault con fallback a pg_settings                  | Backwards compatible. No rompe el cron job existente. Permite migracion gradual.                                      |
| fn_completar_tanda como RPC vs transaction en app | Las transacciones Supabase desde el SDK son limitadas. Un RPC Postgres garantiza atomicidad real con ACID compliance. |
| Bloquear creado→en_preparacion                    | La trazabilidad AMEX es un requisito de negocio critico. El paso recibido_cocina es obligatorio para medir tiempos.   |
