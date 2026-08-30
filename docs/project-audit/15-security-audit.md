# 15 · Auditoría de seguridad

Este repositorio ya pasó una auditoría forense en agosto de 2026 (36 hallazgos, 35 cerrados).
Esta sección **verifica de forma independiente** que los cierres son reales y busca lo que
quedó fuera.

---

## 1. Secretos y credenciales — 🟢

| Comprobación                                                                 | Resultado                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| Búsqueda de claves API, JWT, claves privadas o credenciales AWS en el código | **0 coincidencias**                                     |
| Ficheros `.env` versionados                                                  | Solo `.env.example`                                     |
| `.gitignore` cubre `.env*` con excepción de `.env.example`                   | ✅                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` expuesta en `NEXT_PUBLIC_*`                      | ❌ no ocurre                                            |
| `lib/supabase/admin.ts` importado desde algún componente `'use client'`      | **Ninguno** — verificado recorriendo los 78 componentes |

`admin.ts` lleva `import { createClient } from '@supabase/supabase-js'` sin `server-only`,
pero ninguna ruta de importación lo lleva al bundle del cliente. `emit-event.ts` sí usa
`import 'server-only'`. Añadirlo también a `admin.ts` sería barato y convertiría la
convención en una garantía del compilador. Registrado como **DT-14**.

---

## 2. Autenticación — 🟢

| Aspecto                       | Estado                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Proveedor                     | Supabase Auth (JWT con `app_metadata.role` / `tenant_id`)                             |
| CAPTCHA                       | Turnstile en login, **reenviado a Supabase** como `options.captchaToken`              |
| Fuerza bruta                  | Bucket `login`: 5/15 min **por cuenta**; fail-closed en producción                    |
| Open redirect                 | `getSafeNext()` rechaza `//`, esquemas externos y `/login`                            |
| Revocación de sesión          | `assertCan` relee `users.activo/role/tenant_id` en cada acción                        |
| Cookies                       | Gestionadas por `@supabase/ssr`; el middleware limpia las `sb-*` ante sesión inválida |
| Longitud mínima de contraseña | **8 caracteres**, sin requisitos de composición 🟡                                    |

**El cambio de clave del bucket de login (IP → cuenta) merece mención:** toda la sala sale por
la misma IP del aeropuerto, así que un bucket por IP era un autobloqueo del personal, no una
defensa. Corregido en `dffaa17`.

---

## 3. Autorización — 🟢 (la parte más sólida)

Cuatro capas, con la autoridad en la más profunda. Detalle completo en
[`10-roles-and-permissions.md`](./10-roles-and-permissions.md).

### Verificado sobre la base reconstruida

```sql
RLS habilitada en las 25 tablas             → sí
políticas totales                            → 48
políticas con cmd = 'ALL'                    → 0
grants de authenticated sobre pedidos        → SELECT (solo)
DELETE a anon/authenticated en operativas    → ninguno
funciones SECURITY DEFINER sin search_path   → ninguna
rbac_permisos                                → 144 filas, generadas
```

### Las 12 suites de RLS pasan

Entre ellas, las que demuestran que la autorización **no** es cosmética:

- `f001_signup_no_escala_privilegios` — un registro público no puede autoasignarse rol.
- `f002_principio_rector` — no se puede descontar inventario sin receta desde PostgREST.
- `f036_insert_exige_permiso` — no queda ningún `WITH CHECK` sin predicado de rol.

### Debilidades menores encontradas

| #   | Hallazgo                                                                                                                                                                                                 | Severidad   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `alertas_update_permiso` usa `alertas:read` para `UPDATE`: quien pueda leer alertas puede editar su título, mensaje y severidad, no solo marcarlas leídas                                                | 🟡 Bajo     |
| 2   | `audit_log` y `domain_events` conservan grants `INSERT/UPDATE/DELETE` a `anon`/`authenticated`; solo los triggers `prevent_mutation` los frenan. Defensa de una sola capa sobre el registro de auditoría | 🟡 Bajo     |
| 3   | Las políticas de **lectura** son por tenant, sin filtro de permiso: cualquier rol autenticado del tenant ve todas las filas de las tablas operativas. Decisión consciente y documentada (ADR-004)        | ⚪ Aceptado |
| 4   | `/admin/costos` y `/admin/turnos` solo tienen la barrera del middleware, no `assertCan` a nivel de página                                                                                                | 🟡 Bajo     |

---

## 4. Cabeceras y CSP — 🟢 verificado en ejecución

Respuesta real de `GET /login` sobre el build de producción:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-uVnIrNbfY5iQ4caIYbWGig==' 'strict-dynamic' https: 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://<supabase> wss://<supabase> <socket> https://challenges.cloudflare.com
              https://*.ingest.sentry.io https://*.axiom.co https://in.logs.betterstack.com https://betteruptime.com;
  font-src 'self' data:; img-src 'self' data: https:;
  frame-src https://challenges.cloudflare.com;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  upgrade-insecure-requests
```

**Nonce distinto por respuesta**, generado en el middleware con `crypto.getRandomValues`. El
`'unsafe-inline'` que acompaña al nonce es el repliegue estándar para navegadores sin
`strict-dynamic`; los que lo entienden **ignoran `'unsafe-inline'` en presencia de un nonce**.
Es la construcción correcta, no un descuido.

`upgrade-insecure-requests` y HSTS solo en producción; en desarrollo se conserva
`'unsafe-eval'` para el HMR. Bien segmentado.

Detalle fino: el script inline de `next-themes` que fija el tema antes del primer pintado
recibe el nonce desde el layout (`headerList.get('x-nonce')`). Sin eso, la CSP lo habría
bloqueado y la página habría parpadeado con el tema equivocado.

---

## 5. Validación de entrada — 🟢

- **Doble validación**: Zod en cliente y otra vez en la Server Action. Verificado en las 81
  acciones: ninguna escritura confía en el input del cliente.
- **Sin SQL dinámico** construido con concatenación. Las consultas van por `supabase-js`
  (parametrizadas) o por RPC con parámetros tipados.
- **XSS**: cero usos de `dangerouslySetInnerHTML`, `eval` o `document.write`. El generador de
  QR construye el documento de impresión con la API del DOM en vez de `document.write`
  (cierre de F-031, que era un self-XSS).
- **CSRF**: las Server Actions de Next.js validan el origen por diseño; `form-action 'self'`
  y `frame-ancestors 'none'` refuerzan.

---

## 6. Multi-tenancy — 🟢

| Vector                   | Defensa                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| Lectura cross-tenant     | RLS: `tenant_id = (auth.jwt()->'app_metadata'->>'tenant_id')::uuid`       |
| Escritura cross-tenant   | `fn_puede_en_tenant(permiso, tenant_id)` en el `WITH CHECK`               |
| Fila hija de otro tenant | 5 triggers `fn_validate_*_tenant`                                         |
| Socket cross-tenant      | Salas `${tenantId}:${channel}`, no `${channel}`                           |
| Pedido QR cross-tenant   | Las `recetaId` se validan contra el tenant de la mesa antes de crear nada |
| Colisión de idempotencia | Índice único **por tenant** (`idx_pedidos_idempotency_tenant`)            |

---

## 7. Autenticación de máquina a máquina — 🟢

Tres endpoints protegidos con secreto compartido y **comparación en tiempo constante**
(`timingSafeEqual`), no con `===`:

| Endpoint                  | Secreto              |
| ------------------------- | -------------------- |
| `/api/cron/check-alertas` | `CRON_SECRET`        |
| `/api/heartbeat`          | `CRON_SECRET`        |
| `POST /emit` (socket)     | `SOCKET_EMIT_SECRET` |

Verificado en ejecución: sin secreto configurado devuelven **500 `SERVER_MISCONFIGURED`**, no 200. Fallan cerrado.

`POST /emit` añade allowlist de canales, regex de UUID para el tenant, tope de 64 KB de body
y rate limit indexado por la IP reenviada.

---

## 8. Cadena de suministro — 🟢

- `pnpm audit --audit-level=high --prod` es un job de CI que **falla el pipeline**.
- 9 overrides que fuerzan versiones parcheadas de dependencias transitivas.
- Todas las acciones de GitHub ancladas por SHA.
- `onlyBuiltDependencies` restringe qué paquetes pueden ejecutar scripts de instalación.

---

## 9. Auditoría e inmutabilidad — 🟢

`audit_log` con **hash chain SHA-256** (`audit_log_set_hash` en BEFORE INSERT) y triggers que
bloquean `UPDATE` y `DELETE`. Lo mismo para `domain_events` y `requisicion_eventos`.
Política de lectura restringida a `admin` y `superuser` del propio tenant.

`auditLog()` **nunca interrumpe la operación principal**: captura sus propios errores y los
registra. Correcto — un fallo de auditoría no debe tumbar una entrega de pedido — aunque
implica que una pérdida de auditoría es silenciosa para el usuario (queda en el log).

---

## 10. Privacidad — 🟡

- Banner de Habeas Data (`components/privacy/habeas-data-banner.tsx`).
- Retención de 90 días (`20260513000000_data_retention_90d.sql`,
  `20260527000001_retention_and_eventos_rls.sql`).
- Endpoint de supresión `/api/gdpr/forget`, con rate limit de 3/día fail-closed.

⚠️ **La supresión es incompleta**: anonimiza el email en `auth.users` pero deja
`public.users.nombre` intacto, que es el dato que se muestra en la interfaz y el que enlazan
`turnos`, `pedidos` y `audit_log`. Registrado como **DT-07**.

---

## 11. Lo que esta auditoría no pudo verificar

| Punto                                                                               | Por qué                          |
| ----------------------------------------------------------------------------------- | -------------------------------- |
| Si `SUPABASE_JWT_SECRET` fue rotada (acción de F-027)                               | Configuración externa            |
| Si el registro público está deshabilitado en Supabase Auth (recomendación de F-001) | Configuración externa            |
| Si existe el monitor HTTP contra `/health` (riesgo residual de F-011)               | Configuración de Better Stack    |
| Si `ALLOW_LEGACY_HS256` está apagada en Render                                      | Variable de entorno del servicio |
| Fuerza real de las contraseñas del personal                                         | Política de Supabase Auth        |

Todas están correctamente señaladas como _acciones de configuración pendientes fuera del
repositorio_ en `docs/remediacion/SECURITY_CHANGES.md`. Esta auditoría **no puede confirmar
que se hayan ejecutado**.

---

## 12. Veredicto

**La postura de seguridad de este repositorio es notablemente buena para su tamaño.** La
autorización está en la base de datos y está probada contra una base real; los secretos están
limpios; la CSP es genuina, no decorativa; los endpoints de máquina fallan cerrado.

Los defectos que quedan son de **completitud** (supresión GDPR parcial, grants más anchos de
lo necesario sobre las tablas inmutables, una política de UPDATE con permiso de lectura), no
de diseño. Ninguno de los cinco hallazgos principales de esta auditoría es una
vulnerabilidad: son fallos funcionales.
