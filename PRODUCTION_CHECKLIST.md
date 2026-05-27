# Production Checklist — Enterprise Audit Resolution

**Fecha:** 2026-05-27  
**Commit:** `e7722df`

---

## Readiness Score: 87/100

| Categoria           | Score  | Notas                                                               |
| ------------------- | ------ | ------------------------------------------------------------------- |
| Seguridad           | 90/100 | 21/22 criticos resueltos. Pendiente: C-18 (import cross-modulo)     |
| Integridad de datos | 95/100 | FEFO atomico, audit_log serializado, lotes vencidos filtrados       |
| CI/CD               | 95/100 | SHA pinning, CI gate, permissions, concurrency, backups encriptados |
| RLS / Multi-tenant  | 90/100 | Todos los roles operativos habilitados. Mat views aisladas          |
| Frontend / UX       | 85/100 | HTML valido, closures corregidas, memory leaks fijos                |
| Observabilidad      | 75/100 | Heartbeat desbloqueado. Falta: monitoreo de backups, Sentry tunnel  |
| Compliance (GDPR)   | 70/100 | Retencion funciona. Pendiente: GDPR forget completo                 |

---

## Pre-deploy checklist

### Codigo (completado)

- [x] Typecheck: 0 errores
- [x] Lint: 0 warnings
- [x] Tests: 391/391 verdes
- [x] Sin secrets hardcodeados en codigo
- [x] Sin secrets en NEXT*PUBLIC*\*
- [x] assertCan en todos los server actions
- [x] CHANNEL_ACL validado en chat actions
- [x] FEFO filtra lotes vencidos
- [x] FEFO + estado atomicos via RPC
- [x] Pedido transitions estrictas (sin skip de recibido_cocina)
- [x] QR tokens con TTL 12h
- [x] Rate limiting con IP confiable
- [x] Timing-safe comparison para secrets
- [x] Socket error handler con cleanup
- [x] HTML5 valido en QR layout

### Migraciones (aplicar en orden)

- [ ] `20260527000000_enterprise_audit_fixes.sql` — RLS, vistas, indices, FEFO
- [ ] `20260527000001_retention_and_eventos_rls.sql` — retencion, pedido_eventos
- [ ] `20260527000002_atomic_completar_tanda.sql` — RPC atomico
- [ ] `20260527000003_cron_secret_vault.sql` — Vault para CRON_SECRET

### Infra / Secrets (configurar manualmente)

- [ ] GitHub Secrets: agregar `SUPABASE_PROJECT_REF`
- [ ] GitHub Secrets: agregar `BACKUP_GPG_PASSPHRASE` (generar con `openssl rand -base64 32`)
- [ ] Vercel env vars: agregar `WIFI_NETWORK_NAME` (ej: `American Express`)
- [ ] Vercel env vars: agregar `WIFI_PASSWORD` (la contraseña real del Wi-Fi)
- [ ] Supabase SQL Editor: `INSERT INTO vault.secrets (name, secret) VALUES ('cron_secret', '...')`
- [ ] Supabase SQL Editor: `ALTER DATABASE postgres RESET app.cron_secret`

### Verificacion post-deploy

- [ ] Abrir `/api/heartbeat` — debe responder 200 (no redirect a login)
- [ ] Login como `recepcion` — registrar ingreso en afluencia (C-02)
- [ ] Login como `personal_almacen` — crear un lote (C-17)
- [ ] Login como `chef` — abrir turno (C-03)
- [ ] Login como `admin` — ver KPIs analytics (C-06 — debe mostrar solo su tenant)
- [ ] Escanear QR — Wi-Fi debe mostrar credenciales desde env vars (C-09)
- [ ] Escanear QR expirado (>12h) — debe rechazarse (A-02)
- [ ] Crear pedido via QR — verificar flujo creado→recibido_cocina→en_preparacion (M-12)
- [ ] Better Stack — debe reportar uptime (C-10)
- [ ] GitHub Actions — CI debe pasar antes de deploy (C-13)

---

## Riesgos residuales

### Prioridad alta (resolver en proximo sprint)

| ID   | Riesgo                           | Impacto                                                 | Accion requerida                                 |
| ---- | -------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| C-18 | Import cocina-amex→orders domain | Acoplamiento: cambios en orders rompen KDS AMEX         | Mover tipos compartidos a @dorado/shared-types   |
| A-27 | GDPR forget no limpia app tables | PII en pedido_eventos, mensajes_chat, audit_log payload | Mapear PII y anonimizar en todas las tablas      |
| A-16 | Backup formato ≠ runbook DR      | `pg_restore` fallaria en DR real                        | Actualizar runbook a `psql -f` o cambiar formato |
| A-26 | Backups sin monitoreo externo    | Backup fallido pasa desapercibido dias                  | Agregar notificacion Slack/email en failure      |

### Prioridad media (backlog)

| Riesgo                                          | Accion                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| A-12: TOCTOU en pre-check FEFO                  | Mitigado por FOR UPDATE en cursor; mejora opcional |
| A-13: EXECUTE dinamico en fn_assert_same_tenant | Superficie limitada por %I; documentar invariante  |
| M-04: Receta + ingredientes no transaccional    | Crear RPC atomico similar a fn_completar_tanda     |
| M-08: Turnstile bypass parcial                  | Validar ambas keys siempre presentes               |
| L-02: CSP unsafe-inline                         | Migrar a nonce-based (limitacion Next.js 15)       |
| L-23: Sin Dependabot/Renovate                   | Configurar actualizaciones automaticas             |

---

## Env vars nuevas requeridas

```env
# Wi-Fi credentials (server-side only — never NEXT_PUBLIC_*)
WIFI_NETWORK_NAME=American Express
WIFI_PASSWORD=<contraseña real>

# GitHub Secrets
SUPABASE_PROJECT_REF=<project ref>
BACKUP_GPG_PASSPHRASE=<passphrase para encriptar backups>
```
