# Runbook — Disaster Recovery · Dorado Lounge System

**Sistema:** Dorado Lounge — SaaS multi-tenant 24/7, GISAT S.A.  
**Versión:** 1.0 · Mayo 2026  
**Responsable primario:** Desarrollador / CTO  
**Contacto Supabase:** support.supabase.com · Plan Pro

---

## Objetivos de recuperación

| Métrica | Objetivo | Descripción                                                 |
| ------- | -------- | ----------------------------------------------------------- |
| **RPO** | ≤ 24 h   | Máxima pérdida de datos aceptable (backup diario 03:00 UTC) |
| **RTO** | ≤ 4 h    | Tiempo máximo para restaurar el servicio completo           |

---

## Arquitectura de componentes

```
Vercel (web — Next.js)
    ↕
Render.com Starter (socket-server — Node.js/Socket.io)
    ↕
Supabase (PostgreSQL 15 + Auth + Storage)
```

Todos los datos críticos residen en Supabase. Vercel y Render son stateless y se redesplegan desde el repositorio.

---

## Backups

### Dónde están

| Destino                  | Retención                          | Automatización                                        |
| ------------------------ | ---------------------------------- | ----------------------------------------------------- |
| GitHub Actions Artifacts | 30 días                            | `.github/workflows/backup.yml` — diario 03:00 UTC     |
| S3 (STANDARD_IA)         | Configurable (recomendado 90 días) | Mismo workflow si `BACKUP_S3_BUCKET` está configurado |
| Supabase PITR            | 7 días (Plan Pro)                  | Automático — consola Supabase                         |

### Verificar backup más reciente

1. Ir a **GitHub → Actions → Database Backup** → último run exitoso
2. Descargar artifact `db-backup-YYYYMMDDTHHMMSSZ` (contiene `backup-YYYYMMDDTHHMMSSZ.sql.gz.gpg`)
3. Verificar integridad (descifrar GPG → comprobar gzip → inspeccionar):

   ```bash
   gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
     "backup-YYYYMMDDTHHMMSSZ.sql.gz.gpg" > backup.sql.gz
   gunzip -t backup.sql.gz && echo "gzip OK"
   zcat backup.sql.gz | head -20   # cabecera + primeros INSERT
   ```

---

## Escenarios y procedimientos

### Escenario 1 — Corrupción / pérdida de datos en Supabase

**Síntomas:** Datos incorrectos, tablas vacías inesperadamente, errores 500 en producción.

**Pasos:**

1. **Activar modo mantenimiento** — en Vercel, añadir variable `MAINTENANCE_MODE=1` y redesplegar (o redirigir DNS temporalmente).

2. **Identificar ventana de pérdida** — revisar `audit_log` para encontrar el último evento válido.

3. **Opción A — Supabase PITR** (si < 7 días):

   ```
   Supabase Dashboard → Settings → Backups → Point in Time Recovery
   Seleccionar timestamp anterior al incidente → Restore
   ```

4. **Opción B — Restaurar desde backup externo:**

   El backup es **lógico** (`scripts/ci-backup.py`): SQL plano con `INSERT ... ON CONFLICT DO NOTHING` envuelto en `SET session_replication_role = replica`. **No contiene el esquema** → la base destino debe tener las migraciones aplicadas primero (`supabase db push` vía CI). El `ON CONFLICT DO NOTHING` no sobrescribe filas existentes: para una restauración limpia, `TRUNCATE` las tablas afectadas antes (respetando el orden de FKs) o restaura sobre una base vacía con el esquema ya migrado.

   ```bash
   # Descargar backup de GitHub Artifacts o S3 → backup-YYYYMMDDTHHMMSSZ.sql.gz.gpg

   # 1) Descifrar (GPG simétrico AES256, passphrase = secret BACKUP_GPG_PASSPHRASE)
   gpg --batch --decrypt --passphrase "$BACKUP_GPG_PASSPHRASE" \
     "backup-YYYYMMDDTHHMMSSZ.sql.gz.gpg" > "backup-YYYYMMDDTHHMMSSZ.sql.gz"

   # 2) Descomprimir + cargar vía psql (NO pg_restore — es SQL plano, no -Fc)
   gunzip -c "backup-YYYYMMDDTHHMMSSZ.sql.gz" \
     | psql "postgresql://postgres:<PASSWORD>@<SUPABASE_DB_HOST>:5432/postgres"
   ```

5. **Verificar integridad post-restauración:**

   ```sql
   -- Contar registros críticos
   SELECT COUNT(*) FROM tenants;
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM insumos;
   SELECT COUNT(*) FROM recetas;
   SELECT COUNT(*) FROM pedidos WHERE created_at > now() - interval '7 days';
   -- Verificar hash chain del audit_log
   SELECT id, hash FROM audit_log ORDER BY created_at DESC LIMIT 5;
   ```

6. **Desactivar modo mantenimiento** y monitorear errores en Sentry + Axiom.

---

### Escenario 2 — Caída de Vercel (web)

**Síntomas:** HTTP 502/503 en el dominio principal.

**Pasos:**

1. Verificar estado en `vercel.com/dashboard` y `betteruptime.com`.
2. Si es un deploy roto: **Vercel Dashboard → Deployments → Promote** al último deploy estable.
3. Si es un incidente de Vercel: activar dominio de failover (configurar en DNS como backup).
4. En casos extremos, desplegar manualmente:
   ```bash
   cd apps/web
   pnpm build
   vercel deploy --prod --token=$VERCEL_TOKEN
   ```

---

### Escenario 3 — Caída de socket-server (Render.com)

**Síntomas:** Las notificaciones en tiempo real no funcionan; pedidos y KDS siguen operando (degraded mode).

**Pasos:**

1. Verificar en **Render.com Dashboard → dorado-socket-server → Logs**.
2. Si el servicio crasheó: **Manual Deploy** desde el último commit estable.
3. El sistema continúa operativo en modo degradado (sin real-time) — los pedidos se guardan en DB correctamente.
4. Verificar reconexión: los clientes Socket.io reconectan automáticamente (exponential backoff).

---

### Escenario 4 — Brecha de seguridad / credenciales comprometidas

**Pasos inmediatos (primeros 15 minutos):**

1. **Rotar `SUPABASE_SERVICE_ROLE_KEY`** → Supabase Dashboard → Settings → API.
2. **Revocar todos los JWT activos** → Supabase Auth → Users → "Logout all users" o cambiar JWT secret.
3. **Rotar `JWT_PASSENGER_SECRET`** y redesplegar.
4. **Rotar secrets de GitHub Actions** (SUPABASE_DB_PASSWORD, etc.).
5. Activar `run_secret_scanning` en el repositorio para detectar exposición.
6. Registrar el incidente en `audit_log` manualmente si es necesario.

---

## Checklist post-restauración

- [ ] Tablas críticas tienen datos consistentes
- [ ] RLS activo en todas las tablas (`SELECT tablename FROM pg_tables WHERE schemaname='public'` + verificar políticas)
- [ ] Triggers de `audit_log` y `domain_events` activos
- [ ] `fn_descontar_insumo_fefo` existe y es funcional
- [ ] Auth funciona para al menos un usuario de cada rol
- [ ] Socket.io conecta y emite/recibe eventos (PEDIDO_ESTADO, ITEM_ESTADO, ALERTA_NUEVA)
- [ ] Heartbeat de Better Stack reporta verde
- [ ] Sentry no reporta errores nuevos en los primeros 30 min

---

## Contactos de emergencia

| Servicio   | URL soporte          | SLA respuesta   |
| ---------- | -------------------- | --------------- |
| Supabase   | support.supabase.com | < 4h (Pro)      |
| Vercel     | vercel.com/support   | < 4h (Pro)      |
| Render.com | render.com/support   | < 24h (Starter) |

---

## Secrets necesarios para DR

Documentados en `.env.example`. Los críticos para recuperación:

```
SUPABASE_DB_HOST          # Host de la instancia Postgres
SUPABASE_DB_PASSWORD      # Password del usuario postgres
SUPABASE_SERVICE_ROLE_KEY # Solo lib/supabase/admin.ts
BACKUP_S3_BUCKET          # Bucket S3 para backups externos (opcional)
BACKUP_AWS_ACCESS_KEY_ID
BACKUP_AWS_SECRET_ACCESS_KEY
BACKUP_AWS_REGION
BETTERSTACK_BACKUP_HEARTBEAT_URL  # Monitor separado para backup
```

Todos los secrets deben estar en **1Password** o gestor equivalente — nunca en el repositorio.

---

_Última actualización: Mayo 2026 · Revisar y probar DR cada trimestre._
