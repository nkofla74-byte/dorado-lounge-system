# Security Hardening Report

**Fecha:** 2026-05-27  
**Commit:** `e7722df`

---

## 1. Aislamiento multi-tenant

| Medida                                           | Riesgo mitigado                             | Severidad original |
| ------------------------------------------------ | ------------------------------------------- | ------------------ |
| `getUsers()` scoped por `ctx.tenantId`           | Admin enumera usuarios de otros tenants     | CRITICO            |
| Vistas filtradas por JWT sobre mat views         | KPIs financieros cross-tenant               | CRITICO            |
| `pedidos.idempotency_key` UNIQUE scoped a tenant | Colision de idempotencia cross-tenant       | CRITICO            |
| CHANNEL_ACL enforced en chat server actions      | Lectura/escritura en canales no autorizados | ALTO               |

## 2. Secretos y exposicion

| Medida                                       | Riesgo mitigado                                | Severidad original |
| -------------------------------------------- | ---------------------------------------------- | ------------------ |
| Wi-Fi password movida a env vars server-side | Credenciales en bundle JS / source maps        | CRITICO            |
| `timingSafeEqual` para CRON_SECRET           | Timing side-channel en comparacion de secretos | ALTO               |
| QR tokens con TTL 12h + iat + jti            | Acceso indefinido con foto de sticker QR       | ALTO               |
| PROJECT_REF en env var, no hardcodeado       | Project ref + token comprometido = acceso DB   | CRITICO            |
| CRON_SECRET migrado a Supabase Vault         | Secret legible via `current_setting()`         | CRITICO            |

## 3. RLS / Politicas Postgres

| Medida                                      | Riesgo mitigado                                   | Severidad original |
| ------------------------------------------- | ------------------------------------------------- | ------------------ |
| `recepcion` en afluencia INSERT             | Rol operativo con funcion principal rota          | CRITICO            |
| Todos los roles en turnos INSERT/UPDATE own | Apertura/cierre de turno roto para 11 roles       | CRITICO            |
| `personal_almacen` en lotes INSERT          | Recepcion de lotes via admin client bypass        | CRITICO            |
| `REVOKE EXECUTE` funciones de retencion     | Cualquier usuario puede purgar historial          | ALTO               |
| `pedido_eventos` INSERT restringido por rol | Inyeccion de eventos de estado arbitrarios        | ALTO               |
| `pg_temp` removido de search_path           | Shadow table attack en funciones SECURITY DEFINER | ALTO               |

## 4. Integridad de datos

| Medida                                         | Riesgo mitigado                                 | Severidad original |
| ---------------------------------------------- | ----------------------------------------------- | ------------------ |
| Advisory lock en audit_log hash chain          | Fork de cadena anti-tamper bajo concurrencia    | CRITICO            |
| FEFO filtra lotes vencidos                     | Ingredientes expirados usados en produccion     | CRITICO            |
| RPC `fn_completar_tanda` atomico               | FEFO exitoso + estado fallido = stock fantasma  | CRITICO            |
| UNIQUE (tenant_id, turno_id) en buffet_tickets | Multiples cierres por turno                     | ALTO               |
| `registrarMerma` propaga error de upsert       | Stock deducido sin registro de merma            | ALTO               |
| `completarTanda` distingue error de retry      | Produccion bloqueada por error engañoso         | CRITICO            |
| Transicion `creado→en_preparacion` bloqueada   | Skip de recibido_cocina rompe trazabilidad AMEX | MEDIO              |

## 5. CI/CD hardening

| Medida                                        | Riesgo mitigado                               | Severidad original |
| --------------------------------------------- | --------------------------------------------- | ------------------ |
| `deploy.yml` con `workflow_run` gate          | Tests fallidos llegan a produccion            | CRITICO            |
| GitHub Actions pinneados a commit SHA         | Supply chain attack via tag mutable           | CRITICO            |
| Vercel CLI pinneado a version especifica      | Breaking change rompe deploys                 | ALTO               |
| `permissions: contents: read` en workflows    | GITHUB_TOKEN con permisos excesivos           | ALTO               |
| `concurrency: group` en CI y deploy           | Migraciones y deploys concurrentes            | MEDIO              |
| Backups encriptados con GPG AES256            | DB dump accesible por colaboradores del repo  | CRITICO            |
| Guardia de produccion en scripts destructivos | `reset-users.mjs` ejecutado contra produccion | CRITICO            |

## 6. Frontend / auth

| Medida                                               | Riesgo mitigado                         | Severidad original |
| ---------------------------------------------------- | --------------------------------------- | ------------------ |
| `getUser()` primero, `getSession()` solo para token  | Auth basada en cookie sin verificacion  | ALTO               |
| `toggleDisponibilidadPlato` requiere `recipes:write` | Mesero puede activar/desactivar platos  | ALTO               |
| Socket error handler limpiado en cleanup             | Memory leak por listeners acumulados    | ALTO               |
| QR layout sin html/body anidado                      | HTML invalido, accesibilidad rota       | CRITICO            |
| ThemeProvider storageKey separado para QR            | Race condition visual staff vs pasajero | CRITICO            |
| Rate limiting prioriza x-real-ip                     | IP spoofing bypasa rate limiting        | ALTO               |

---

## Riesgos pendientes

| ID   | Riesgo                                     | Severidad | Mitigacion actual                                            |
| ---- | ------------------------------------------ | --------- | ------------------------------------------------------------ |
| C-18 | Import cross-modulo cocina-amex→orders     | CRITICO   | ESLint no lo detecta; refactor a shared-types pendiente      |
| A-12 | TOCTOU en pre-check FEFO                   | ALTO      | FOR UPDATE en cursor real mitiga; pre-check es solo UX       |
| A-13 | EXECUTE dinamico en fn_assert_same_tenant  | ALTO      | `%I` escapa correctamente; superficie limitada               |
| A-27 | GDPR forget incompleto (PII en app tables) | ALTO      | Solo anonimiza auth.users; mapeo PII pendiente               |
| A-16 | Backup formato mismatch con runbook DR     | ALTO      | Runbook dice pg_restore pero backup es SQL plain             |
| A-26 | Backups sin monitoreo de fallos            | ALTO      | Solo anotacion en GH Actions; notificacion externa pendiente |
