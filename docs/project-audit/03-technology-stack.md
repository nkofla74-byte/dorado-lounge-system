# 03 · Stack tecnológico

Todo lo de esta página se leyó de los `package.json` reales y del lockfile, no de la
documentación.

## 1. Versiones fijadas

| Capa               | Tecnología                                                       | Versión declarada                                        |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Runtime            | Node.js                                                          | 22 (CI y Render)                                         |
| Gestor de paquetes | pnpm                                                             | 10.33.2 (fijado en `packageManager`)                     |
| Framework          | Next.js (App Router)                                             | 15.5.21                                                  |
| UI                 | React                                                            | 18.3.1                                                   |
| Lenguaje           | TypeScript                                                       | 5.7.2 · `strict`                                         |
| Estilos            | Tailwind CSS                                                     | 3.4.17                                                   |
| Componentes        | shadcn/ui sobre Radix UI                                         | Radix 1.x/2.x                                            |
| Iconos             | lucide-react                                                     | 0.468.0                                                  |
| Tipografía         | geist                                                            | 1.7.0                                                    |
| Base de datos      | Supabase (PostgreSQL 15)                                         | `@supabase/supabase-js` 2.105.1 · `@supabase/ssr` 0.10.2 |
| Tiempo real        | Socket.io                                                        | server 4.8.1 · client 4.8.3                              |
| Validación         | Zod                                                              | 3.25.76                                                  |
| Formularios        | react-hook-form + `@hookform/resolvers`                          | 7.75.0                                                   |
| i18n               | next-intl                                                        | 4.11.0                                                   |
| Temas              | next-themes                                                      | 0.4.6                                                    |
| Notificaciones UI  | sonner                                                           | 2.0.7                                                    |
| JWT                | jose 6.2.3 · jsonwebtoken 9.0.3                                  |                                                          |
| Rate limiting      | `@upstash/ratelimit` 2.0.8 + `@upstash/redis` 1.38.0             |                                                          |
| QR                 | qrcode 1.5.4                                                     |                                                          |
| Pruebas unitarias  | Vitest                                                           | 2.1.8/2.1.9                                              |
| Pruebas E2E        | Playwright                                                       | 1.49.1                                                   |
| Observabilidad     | `@sentry/nextjs` 10.51 · `next-axiom` 1.10 · `@logtail/next` 0.3 |                                                          |
| Logging (socket)   | pino 9.5 + `@axiomhq/pino`                                       |                                                          |

## 2. Configuración verificada

| Fichero                            | Qué hace                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.mjs`         | Encadena next-intl → Axiom → Better Stack → Sentry. Cabeceras de seguridad estáticas. **No** define la CSP (necesita nonce por petición). |
| `apps/web/tsconfig.json`           | TS strict; alias `@/*`                                                                                                                    |
| `apps/web/tailwind.config.ts`      | Tokens de diseño propios (`senal-*`, `zona-*`, `area-*`)                                                                                  |
| `apps/web/vitest.config.ts`        | jsdom; umbrales de cobertura                                                                                                              |
| `apps/web/playwright.config.ts`    | `testDir: ./e2e`, proyecto `setup` + `chromium`, `fullyParallel: false`                                                                   |
| `apps/web/vercel.json`             | 2 crons: `/api/heartbeat` diario 06:00, `/api/cron/check-alertas` diario 03:00                                                            |
| `render.yaml`                      | Servicio web `dorado-lounge-socket`, plan Starter, healthcheck `/health`                                                                  |
| `packages/eslint-config/index.js`  | Regla que enforza la dirección de dependencias hexagonal                                                                                  |
| `commitlint.config.js` + `.husky/` | Conventional Commits; pre-commit ejecuta prettier y typecheck                                                                             |
| `.prettierrc` / `.prettierignore`  | Formato; `pnpm format:check` es un gate de CI                                                                                             |

## 3. Seguridad de la cadena de suministro

`package.json` fija **9 overrides** de seguridad sobre dependencias transitivas
(`brace-expansion`, `fast-uri`, `js-yaml`, `minimatch>brace-expansion`, `nanoid`, `postcss`,
`sharp`, `socket.io-parser`, `ws`). El job `audit` de CI ejecuta
`pnpm audit --audit-level=high --prod` y falla el pipeline con cualquier vulnerabilidad alta.

Todas las acciones de GitHub están **ancladas por SHA**, no por etiqueta —cierre del hallazgo
F-032.

## 4. Estado de las herramientas, medido

```
pnpm install --frozen-lockfile     → exit 0 (13,2 s)
pnpm typecheck                      → exit 0 · 5 proyectos, 0 errores
pnpm lint                           → exit 0 · "✔ No ESLint warnings or errors"
pnpm test                           → exit 0 · 567 pruebas
pnpm --filter @dorado/web build     → exit 0 · 29 rutas, 226 kB de JS compartido
```

### Un aviso real, no bloqueante

`next lint` imprime: _"`next lint` is deprecated and will be removed in Next.js 16"_.
Migrar a la CLI de ESLint es trabajo pendiente antes de subir a Next 16. Registrado en
[`20-technical-debt.md`](./20-technical-debt.md) como DT-09.

## 5. Cobertura de lint por paquete — hueco detectado

`pnpm lint` recorre los workspaces con `--if-present`. Solo `apps/web` y `apps/socket-server`
declaran un script `lint`:

| Paquete                      | ¿script `lint`?                           |
| ---------------------------- | ----------------------------------------- |
| `apps/web`                   | ✅ `next lint`                            |
| `apps/socket-server`         | ✅ `eslint src/`                          |
| `packages/shared-types`      | ❌ (tiene eslint como devDep, sin script) |
| `packages/shared-validation` | ❌ (idem)                                 |
| `packages/eslint-config`     | ❌ (n/a)                                  |

Los dos paquetes compartidos —que son _la fuente de verdad_ de los contratos— **no se
lintan** en CI. Registrado como DT-10.

## 6. Variables de entorno

`.env.example` (4,2 KB) documenta el conjunto. Las que el código exige en tiempo de ejecución:

| Variable                                   | Consumidor                      | Comportamiento si falta                                                                               |
| ------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                 | middleware, clientes            | El middleware lanza (`!` no nulable)                                                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | middleware, clientes            | Idem                                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                | `lib/supabase/admin.ts`         | Fallo en la primera acción admin                                                                      |
| `NEXT_PUBLIC_SOCKET_URL`                   | cliente socket + `emitEvent`    | Cae a `http://localhost:3001`                                                                         |
| `SOCKET_EMIT_SECRET`                       | `emitEvent` y socket-server     | **Web:** suprime todo el tiempo real con un `console.warn`. **Socket:** `process.exit(1)` al arrancar |
| `JWT_PASSENGER_SECRET`                     | tokens QR de mesa               | Lanza `JWT_PASSENGER_SECRET no configurado`                                                           |
| `CRON_SECRET`                              | `/api/cron/*`, `/api/heartbeat` | **HTTP 500 `SERVER_MISCONFIGURED`** — comprobado en ejecución                                         |
| `TURNSTILE_SECRET_KEY`                     | pedidos QR                      | Si no está, se omite la verificación anti-bot                                                         |
| `UPSTASH_REDIS_REST_*`                     | rate limiting                   | _Fail-open_ en dev; **fail-closed en producción** para `login`, `gdpr` y `qrOrder`                    |
| `SENTRY_DSN` / `AXIOM_*` / `BETTERSTACK_*` | observabilidad                  | Se desactivan silenciosamente                                                                         |
| `ALLOW_LEGACY_HS256`                       | socket-server                   | Sin ella, los JWT HS256 legacy se rechazan (bien)                                                     |

**Detalle bien resuelto:** el rate limiter distingue buckets _fail-open_ de _fail-closed_.
En producción, si Upstash no está configurado, el login se bloquea en vez de quedar abierto.
