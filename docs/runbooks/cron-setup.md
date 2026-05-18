# Runbook — Configurar pg_cron para alertas

> **Cuándo**: una sola vez post-deploy, y cada vez que cambie `CRON_SECRET` o la URL del proyecto en Vercel.

El sistema tiene dos crons que disparan `/api/cron/check-alertas`:

| Cron                  | Frecuencia   | Origen                     | Necesario                                  |
| --------------------- | ------------ | -------------------------- | ------------------------------------------ |
| `pg_cron` en Supabase | cada 5 min   | migración `20260516000003` | Sí — alertas AMEX necesitan latencia <5min |
| Vercel Cron           | diario 03:00 | `apps/web/vercel.json`     | Fallback                                   |

`pg_cron` lee la URL y el secret desde `app.cron_base_url` / `app.cron_secret`. Si no están seteados, el cron es no-op (el `WHERE` de la migración previene errores).

## Pasos (Supabase Dashboard → SQL Editor)

1. **Obtener los valores que vas a inyectar**
   - URL de producción del proyecto en Vercel — ejemplo: `https://dorado-lounge-system-web.vercel.app`
   - El mismo `CRON_SECRET` que está en las env vars de Vercel.

2. **Setear los settings a nivel de base de datos**

   ```sql
   ALTER DATABASE postgres SET app.cron_base_url = 'https://<proyecto>.vercel.app';
   ALTER DATABASE postgres SET app.cron_secret   = '<valor de CRON_SECRET>';
   ```

3. **Reiniciar la conexión** para que `current_setting()` lea los valores nuevos:

   ```sql
   SELECT pg_reload_conf();
   ```

4. **Verificar** que el job está activo:

   ```sql
   SELECT jobname, schedule, active
   FROM cron.job
   WHERE jobname = 'check-alertas';
   ```

5. **Esperar 5 min y revisar ejecuciones**:
   ```sql
   SELECT jobname, status, return_message, start_time
   FROM cron.job_run_details
   WHERE jobname = 'check-alertas'
   ORDER BY start_time DESC
   LIMIT 5;
   ```

   - `status = 'succeeded'` → todo OK.
   - `status = 'failed'` con `connection refused` → la URL no es alcanzable.
   - `status = 'succeeded'` pero `return_message` con HTTP 401 → el secret no coincide.

## Diagnóstico de fallos comunes

| Síntoma                                    | Causa                                        | Fix                                                                            |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `status: failed` + "connection refused"    | URL no accesible o `app.cron_base_url` vacío | Verificar `SHOW app.cron_base_url;`                                            |
| HTTP 401 en `return_message`               | Secret no coincide                           | Re-setear `app.cron_secret` con el valor de Vercel                             |
| HTTP 429 en `return_message`               | Rate limit golpeado (10/IP/min)              | El IP de pg_net cuenta como 1, no debería pasar — investigar tráfico anómalo   |
| No hay registros en `cron.job_run_details` | `pg_cron` no está corriendo                  | Asegurar `CREATE EXTENSION pg_cron` y reiniciar la DB desde Supabase Dashboard |

## Local (opcional)

En desarrollo local con Supabase CLI:

```toml
# supabase/config.toml
[db.settings]
"app.cron_base_url" = "http://host.docker.internal:3000"
"app.cron_secret"   = "dev-secret"
```

Pero como CLAUDE.md prohíbe `supabase start`, en local simplemente se ignora — el endpoint web funciona, solo no hay disparo automático.
