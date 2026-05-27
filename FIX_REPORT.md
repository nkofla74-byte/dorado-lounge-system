# Fix Report — Enterprise Audit Resolution

**Fecha:** 2026-05-27  
**Commit:** `e7722df`  
**Validacion:** typecheck OK, lint OK, 391 tests verdes (36 archivos)  
**Archivos modificados:** 41 (+1440 / -415 lineas)

---

## Hallazgos resueltos: 42 total

### CRITICOS (21 de 22 resueltos)

| ID   | Problema                                    | Archivo(s)                                                                      | Estado   |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| C-01 | Admin enumera usuarios de todos los tenants | `superuser/actions.ts`                                                          | Resuelto |
| C-02 | `recepcion` bloqueado por RLS en afluencia  | `migration 20260527000000`                                                      | Resuelto |
| C-03 | Roles no-admin no pueden gestionar turnos   | `migration 20260527000000`                                                      | Resuelto |
| C-04 | FEFO + estado no atomicos                   | `migration 20260527000002` + `production/actions.ts`                            | Resuelto |
| C-05 | Race condition en audit_log hash chain      | `migration 20260527000000`                                                      | Resuelto |
| C-06 | Mat views sin RLS (cross-tenant)            | `migration 20260527000000` + `analytics-repository.ts` + `flight-repository.ts` | Resuelto |
| C-07 | Trigger append-only vs retencion            | `migration 20260527000001`                                                      | Resuelto |
| C-08 | pedidos.idempotency_key UNIQUE global       | `migration 20260527000000`                                                      | Resuelto |
| C-09 | Wi-Fi password en bundle cliente            | `qr-passenger-app.tsx` + `qr/page.tsx`                                          | Resuelto |
| C-10 | /api/heartbeat bloqueado por middleware     | `middleware.ts`                                                                 | Resuelto |
| C-11 | html/body anidados en QR layout             | `qr/[locale]/layout.tsx`                                                        | Resuelto |
| C-12 | PROJECT_REF hardcodeado en scripts          | `ci-backup.py` + `ci-migrate.py`                                                | Resuelto |
| C-13 | Deploy sin esperar CI                       | `deploy.yml`                                                                    | Resuelto |
| C-14 | GitHub Actions sin SHA pinning              | Todos los `*.yml`                                                               | Resuelto |
| C-15 | CRON_SECRET en pg_settings                  | `migration 20260527000003`                                                      | Resuelto |
| C-16 | Scripts destructivos sin guardia            | `reset-users.mjs` + `reset-test-users.mjs`                                      | Resuelto |
| C-17 | personal_almacen excluido de lotes          | `migration 20260527000000`                                                      | Resuelto |
| C-19 | completarTanda error falso en retry         | `production/actions.ts`                                                         | Resuelto |
| C-20 | ThemeProvider storageKey colision           | `theme-provider.tsx` + `qr/layout.tsx`                                          | Resuelto |
| C-21 | FEFO no filtra lotes vencidos               | `migration 20260527000000`                                                      | Resuelto |
| C-22 | Backups sin encriptar                       | `backup.yml`                                                                    | Resuelto |

**No resuelto:** C-18 (import cross-modulo cocina-amex→orders) — requiere refactor de shared-types

### ALTOS (21 de 28 resueltos)

| ID   | Problema                                     | Archivo(s)                        | Estado   |
| ---- | -------------------------------------------- | --------------------------------- | -------- |
| A-01 | CRON_SECRET comparacion no timing-safe       | `check-alertas/route.ts`          | Resuelto |
| A-02 | QR tokens sin expiracion                     | `lib/qr/token.ts`                 | Resuelto |
| A-03 | IP spoofing en rate limiting                 | `lib/rate-limit.ts`               | Resuelto |
| A-04 | Chat sin validacion CHANNEL_ACL              | `chat/actions.ts`                 | Resuelto |
| A-05 | Funciones retencion callable por todos       | `migration 20260527000000`        | Resuelto |
| A-07 | getSession() insegura en dashboard           | `(dashboard)/layout.tsx`          | Resuelto |
| A-08 | Socket error handler memory leak             | `socket-provider.tsx`             | Resuelto |
| A-09 | stockOut tipo ajuste incorrecto              | `inventory/actions.ts`            | Resuelto |
| A-10 | registrarMerma silencia error upsert         | `inventory/actions.ts`            | Resuelto |
| A-14 | pedido_eventos INSERT sin rol                | `migration 20260527000001`        | Resuelto |
| A-15 | cerrar_turnos_expirados sin SECURITY DEFINER | `migration 20260527000000`        | Resuelto |
| A-17 | vercel@latest sin pinning                    | `deploy.yml`                      | Resuelto |
| A-18 | Missing workflow permissions                 | Todos los `*.yml`                 | Resuelto |
| A-19 | toggleDisponibilidadPlato permiso incorrecto | `orders/actions.ts`               | Resuelto |
| A-20 | Stale closure en FlightsBoard                | `flights-board.tsx`               | Resuelto |
| A-21 | Double getUser() en proveedores              | `proveedores/page.tsx`            | Resuelto |
| A-22 | pg_temp en search_path                       | `migration 20260527000000`        | Resuelto |
| A-23 | fn_costo_receta STABLE incorrecto            | `migration 20260527000000`        | Resuelto |
| A-25 | useElapsed stale closure KDS AMEX            | `kds-board-amex.tsx`              | Resuelto |
| A-28 | buffet_tickets sin UNIQUE turno              | `migration 20260527000000`        | Resuelto |
| A-11 | Snack no descuenta stock                     | N/A — fluye via production (C-04) | Mitigado |

### MEDIOS Y BAJOS (5 resueltos)

| ID   | Problema                                    | Fix                              |
| ---- | ------------------------------------------- | -------------------------------- |
| M-09 | SOCKET_EMIT_SECRET missing silencia eventos | Warning en produccion            |
| M-12 | creado→en_preparacion skip permitido        | Transicion bloqueada en enums.ts |
| M-16 | Indices faltantes en turno_id               | 4 indices parciales creados      |
| M-27 | global-error.tsx strings hardcodeados       | Deteccion de idioma es/en        |
| L-17 | formatTime duplicado                        | Extraido a formatFlightTime      |
| L-20 | key={i} en ingredientes QR                  | key estable por nombre           |

---

## Migraciones SQL creadas

| Archivo                                        | Contenido                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260527000000_enterprise_audit_fixes.sql`    | RLS (C-02, C-03, C-17), vistas tenant (C-06), idempotency scope (C-08), FEFO expired filter (C-21), audit_log advisory lock (C-05), REVOKE funciones retencion (A-05), buffet UNIQUE (A-28), pg_temp removal (A-22), fn_costo VOLATILE (A-23), SECURITY DEFINER turnos (A-15), indices turno_id (M-16) |
| `20260527000001_retention_and_eventos_rls.sql` | Append-only removido de mensajes_chat (C-07), pedido_eventos INSERT restringido por rol (A-14)                                                                                                                                                                                                         |
| `20260527000002_atomic_completar_tanda.sql`    | RPC fn_completar_tanda atomico: FEFO + estado en 1 transaccion (C-04)                                                                                                                                                                                                                                  |
| `20260527000003_cron_secret_vault.sql`         | fn_get_cron_secret con Vault + fallback pg_settings (C-15)                                                                                                                                                                                                                                             |

---

## Post-deploy manual (requerido)

1. **Supabase Dashboard → SQL Editor:**

   ```sql
   INSERT INTO vault.secrets (name, secret) VALUES ('cron_secret', '<valor CRON_SECRET>');
   ALTER DATABASE postgres RESET app.cron_secret;
   ```

2. **GitHub Secrets:** agregar `SUPABASE_PROJECT_REF` y `BACKUP_GPG_PASSPHRASE`

3. **Vercel env vars:** agregar `WIFI_NETWORK_NAME` y `WIFI_PASSWORD`
