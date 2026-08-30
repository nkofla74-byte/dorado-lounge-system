# 13 · Integraciones externas

Nueve servicios externos. Para cada uno: qué hace, dónde está el código, si está realmente
conectado y qué pasa si falta.

---

## 1. Supabase — 🟢 integración central

| Aspecto     | Detalle                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Qué aporta  | PostgreSQL 15, Auth (JWT), PostgREST, Storage                                                                                             |
| Clientes    | `lib/supabase/client.ts` (navegador) · `server.ts` (SSR con cookies) · `admin.ts` (service_role)                                          |
| Aislamiento | `admin.ts` lleva el comentario _"NUNCA importar desde componentes cliente"_. **Verificado: ningún componente `'use client'` lo importa.** |
| Migraciones | Las aplica la **integración nativa Supabase ↔ GitHub** al fusionar en `main` (ADR-007)                                                    |
| Gate        | La protección de rama sobre `main`: lo que gatea el merge gatea la base                                                                   |

**Nota histórica documentada y verificable:** entre junio y agosto de 2026 convivieron dos
caminos de migración (el job de CI y la integración nativa). El job se retiró el 2026-08-25
tras comprobar en `schema_migrations` que llevaba desde el 11 de junio sin aplicar nada. El
comentario que lo explica sigue en `deploy.yml` — buena práctica de documentación en el sitio
donde alguien la buscará.

### ⚠️ Storage: declarado pero sin uso

`CLAUDE.md` lista Storage en el stack. **No hay ninguna llamada a `supabase.storage` en todo
el repositorio.** Las imágenes de plato se guardan como `recetas.imagen_url` (texto) y se
renderizan con `<img>` crudo (con `eslint-disable @next/next/no-img-element`). No existe
subida de imágenes desde la aplicación: la URL se pega a mano en el formulario de metadatos
de menú. Registrado como **DT-08**.

---

## 2. Socket.io sobre Render.com — 🟡 parcialmente conectado

| Aspecto       | Detalle                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Servicio      | `dorado-lounge-socket`, plan **Starter** (sin hibernación)                    |
| Healthcheck   | `GET /health`                                                                 |
| Build         | Build del monorepo completo, para que `@dorado/shared-types` se compile antes |
| Autenticación | JWKS remoto de Supabase (ES256/RS256); HS256 legacy solo con opt-in           |
| Aislamiento   | Salas `${tenantId}:${channel}`                                                |

**Estado funcional: 7 de 11 canales conectados de extremo a extremo.** Ver
[`12-api-and-services.md §5`](./12-api-and-services.md).

**Variable no declarada en `render.yaml`:** el servicio declara `SUPABASE_JWT_SECRET` pero
**no** `ALLOW_LEGACY_HS256`. Es coherente: la rama legacy debe estar apagada. Sin embargo,
`SUPABASE_JWT_SECRET` ya no es obligatoria (el código lo dice explícitamente) y seguir
declarándola invita a mantener viva una clave que el tracker de remediación marca como
**"acción de despliegue: rotar"** (F-027). Registrado como DT-13.

---

## 3. Sentry — 🟢 conectado

- Web: `@sentry/nextjs` vía `withSentryConfig` en `next.config.mjs`, con
  `hideSourceMaps: true` y `widenClientFileUpload: true`.
- Socket: `@sentry/node` con `tracesSampleRate: 0.1`, activado solo si hay `SENTRY_DSN`.
- `lib/result.ts` → `toAppError()` captura excepciones inesperadas con import dinámico, para
  no meter Sentry en bundles que no lo necesitan. **No captura en `NODE_ENV === 'test'`.**
- Las violaciones de ACL de canal se envían como `captureMessage` de nivel `warning`.
- El workflow `deploy.yml` crea una release de Sentry con sourcemaps
  (`continue-on-error: true`, así que un fallo aquí no rompe el despliegue).

---

## 4. Axiom — 🟢 conectado

`next-axiom` (`withAxiom`) en la web y `@axiomhq/pino` en el socket-server. Requiere
`AXIOM_TOKEN` y `AXIOM_DATASET`. Sin ellas, se desactiva en silencio.

---

## 5. Better Stack — 🟡 conectado a medias

Dos usos distintos:

- **Logs**: `@logtail/next` (`withBetterStackNextConfig`) con `BETTERSTACK_SOURCE_TOKEN`.
- **Uptime**: `/api/heartbeat` hace ping a `BETTERSTACK_HEARTBEAT_URL`, disparado por Vercel
  Cron **una vez al día**.

⚠️ Un latido diario detecta una caída con hasta 24 h de retraso. El propio código lo advierte:
_"Para detección rápida, complementar con un monitor HTTP contra `/health`"_. Ese monitor es
configuración externa y esta auditoría **no puede verificar si existe**. Es exactamente el
tipo de riesgo residual que registra F-011 en el tracker.

El workflow de backup también pinguea `BETTERSTACK_BACKUP_HEARTBEAT_URL` al terminar con
éxito — buena práctica: el backup se monitoriza a sí mismo.

---

## 6. Cloudflare Turnstile — 🟢 conectado, _fail-closed_

`components/ui/turnstile-widget.tsx` + `lib/turnstile/verify.ts`.

Usado en el **login** y en el **pedido por QR**. La verificación es _fail-closed_: si la
llamada a Cloudflare falla, la operación se rechaza (cierre de F-013, 2 pruebas). En el login
el token se reenvía además a Supabase Auth en `options.captchaToken`, de modo que la
validación la hace el propio proveedor de identidad (cierre del riesgo residual de F-012).

CSP: `frame-src https://challenges.cloudflare.com` y el host correspondiente en
`connect-src`. Verificado en la cabecera real de la respuesta.

---

## 7. Upstash Redis — 🟢 conectado, con política diferenciada

Cinco buckets en `lib/rate-limit.ts`:

| Bucket      | Límite     | Clave              | Si falta Upstash en producción |
| ----------- | ---------- | ------------------ | ------------------------------ |
| `login`     | 5 / 15 min | **cuenta** (no IP) | **fail-closed** 🔒             |
| `gdpr`      | 3 / día    | usuario            | **fail-closed** 🔒             |
| `qrOrder`   | 6 / 10 min | `tenant:mesa:ip`   | **fail-closed** 🔒             |
| `cron`      | 10 / min   | IP                 | fail-open                      |
| `heartbeat` | 60 / min   | IP                 | fail-open                      |

La distinción entre buckets _fail-open_ y _fail-closed_ es una decisión de diseño acertada y
poco frecuente: los caminos sensibles se cierran si falta la infraestructura, los de máquina
no bloquean la operación.

El cambio de clave de `login` de IP a cuenta (commit `dffaa17`) resolvió un problema
operativo real: toda la sala sale por la misma IP del aeropuerto, así que un bucket por IP
bloqueaba a todo el personal.

---

## 8. Vercel — 🟢 conectado

Despliegue con `vercel build --prod` + `vercel deploy --prebuilt --prod`, disparado por el
workflow `Deploy` tras el gate de CI. Environment `production` con URL declarada.

`apps/web/vercel.json` define 2 crons diarios. El plan limita la frecuencia; por eso la
cadencia real de los checks de alertas la aporta `pg_cron` (cada 5 min) y Vercel Cron solo
actúa de respaldo. Esto está correctamente documentado en el código tras cerrar F-024.

---

## 9. GitHub Actions — 🟢 conectado

| Workflow     | Disparador                     | Jobs                                                                                                         |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `ci.yml`     | push/PR a `main`               | `e2e`, `lint`, `typecheck`, `test`, `rls`, `audit` (6 jobs)                                                  |
| `deploy.yml` | `workflow_run` de CI en `main` | `gate` → `deploy-web` → `notify-sentry`                                                                      |
| `backup.yml` | diario `0 3 * * *` + manual    | Export vía Management API → verificación de tamaño → gzip → **GPG AES-256** → artifact 30 días → S3 opcional |

Todas las acciones **ancladas por SHA** (F-032). El backup verifica que el fichero supere
1 KB antes de darlo por bueno — evita el fallo clásico del backup vacío que nadie detecta.

---

## 10. Resumen de estado

| Integración        | Conectada | Verificada en esta auditoría                       |
| ------------------ | :-------: | -------------------------------------------------- |
| Supabase (DB/Auth) |    🟢     | Migraciones y RLS, sí. Auth en vivo, no            |
| Supabase Storage   |    🔴     | **Declarada pero sin usar**                        |
| Socket.io / Render |    🟡     | Código sí; 4 canales desconectados                 |
| Sentry             |    🟢     | Configuración leída                                |
| Axiom              |    🟢     | Configuración leída                                |
| Better Stack       |    🟡     | Latido diario; monitor de `/health` no verificable |
| Turnstile          |    🟢     | Código + CSP verificados                           |
| Upstash Redis      |    🟢     | Código verificado                                  |
| Vercel             |    🟢     | Config verificada                                  |
| GitHub Actions     |    🟢     | Workflows leídos y coherentes                      |

**Ninguna integración es un mock.** Todas apuntan a servicios reales; lo que varía es si el
extremo del repositorio está completo.
