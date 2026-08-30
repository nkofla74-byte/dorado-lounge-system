# 00 · Resumen ejecutivo

> Auditoría exhaustiva del repositorio `dorado-lounge-system`.
> Fecha: **2026-08-30** · Commit auditado: `828ab9d` · Rama: `claude/repository-comprehensive-audit-vi1cr4`
> Método: lectura del 100 % del código + **ejecución real** (instalación, typecheck, lint, 567 pruebas, build de producción, arranque del servidor y aplicación de las 80 migraciones sobre un PostgreSQL limpio).

---

## 1. Qué es este software

Un **SaaS multi-tenant** para operar la sala VIP de un aeropuerto (Dorado Lounge, El Dorado,
Bogotá). Cubre el ciclo completo de una cocina de sala: recepción de mercancía en bodega →
recetas y costos → producción por tandas → pedidos por zona (AMEX, Snack, Buffet) →
despacho por área de cocina en pantallas KDS → entrega y descuento de inventario.

Incluye además una carta digital por QR para el pasajero, sin login, en cuatro idiomas.

## 2. Veredicto en una línea

**El núcleo operativo está construido, probado y desplegable. La capa analítica está rota.
La capa de tiempo real está construida pero conectada solo a medias.**

## 3. Lo que se comprobó ejecutando, no leyendo

| Comprobación                                 | Resultado                                      |
| -------------------------------------------- | ---------------------------------------------- |
| `pnpm install --frozen-lockfile`             | ✅ OK                                          |
| `pnpm typecheck` (5 proyectos, TS strict)    | ✅ 0 errores                                   |
| `pnpm lint` (ESLint + next lint)             | ✅ 0 avisos, 0 errores                         |
| `pnpm test` (Vitest)                         | ✅ **567 pruebas / 56 ficheros, todas verdes** |
| `pnpm --filter @dorado/web build`            | ✅ compila, **29 rutas** generadas             |
| `next start` + peticiones HTTP reales        | ✅ arranca; el guardia de sesión redirige      |
| 80 migraciones sobre PostgreSQL 16 limpio    | ✅ aplican todas, sin error                    |
| `scripts/sql-harness/run-tests.sh` (RLS/RPC) | ✅ **12 de 12 suites verdes**                  |

Ninguna de estas cifras procede de la documentación del repositorio: todas se midieron
en esta sesión.

## 4. Los cinco hallazgos que importan

| #                                                                           | Severidad  | Qué pasa                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H-A · La pantalla de Analítica no puede leer sus datos**                  | 🔴 Crítico | La vista es `security_invoker=true` y la misma migración revoca el `SELECT` sobre la vista materializada de la que depende. Un admin recibe `permission denied`. Verificado ejecutando SQL. |
| **H-B · La analítica del superuser devuelve siempre vacío**                 | 🔴 Crítico | El camino cross-tenant usa `service_role`, cuyo JWT no lleva `tenant_id`; el `WHERE` de la vista filtra todas las filas.                                                                    |
| **H-C · La campana de alertas nunca recibe nada en tiempo real**            | 🟠 Alto    | `AlertasBell` escucha eventos `ALERTA` pero jamás hace `socket.emit('join', …)`. Como el broadcast va a la sala `tenant:canal`, el evento no llega.                                         |
| **H-D · La vista materializada de analítica no tiene refresco programado**  | 🟠 Alto    | `pg_cron` solo agenda `check-alertas` y `cerrar-turnos-expirados`. Los datos quedan congelados hasta que un admin pulse "refrescar".                                                        |
| **H-E · Los pedidos por QR no despiertan los KDS de AMEX ni de Pastelería** | 🟠 Alto    | El alta interna emite a 3 canales; el alta por QR solo a `sala:cocina`.                                                                                                                     |

## 5. Estado por área (metodología en §12 del informe)

| Área                     | Estado | %        |
| ------------------------ | ------ | -------- |
| Base de datos y RLS      | 🟢     | **95 %** |
| Autenticación y sesión   | 🟢     | **95 %** |
| Roles y permisos         | 🟢     | **95 %** |
| Inventario (FEFO, merma) | 🟢     | **90 %** |
| Pedidos y KDS            | 🟢     | **88 %** |
| Recetas y costos         | 🟢     | **85 %** |
| Requisiciones            | 🟢     | **90 %** |
| Turnos                   | 🟢     | **85 %** |
| Seguridad                | 🟢     | **88 %** |
| Despliegue / CI          | 🟢     | **90 %** |
| Testing                  | 🟡     | **72 %** |
| Navegación y pantallas   | 🟡     | **82 %** |
| Tiempo real (Socket.io)  | 🟡     | **60 %** |
| Alertas                  | 🟡     | **55 %** |
| Documentación            | 🟡     | **75 %** |
| Modo offline             | 🟡     | **40 %** |
| **Analítica / reportes** | ⚫     | **20 %** |
| Integraciones externas   | 🟡     | **70 %** |

**Media ponderada por peso operativo: ≈ 80 %.**

## 6. Siguiente paso recomendado

Un solo cambio de una línea desbloquea la mitad de los hallazgos críticos:
recrear `v_consumo_vs_produccion_turno_tenant` **sin** `security_invoker`, o devolver
el `SELECT` sobre la vista materializada a `authenticated`. A continuación, resolver el
camino del superuser y añadir el `join` que falta en la campana de alertas.

Detalle completo en [`21-roadmap.md`](./21-roadmap.md).

## 7. Lo que esta auditoría **no** pudo comprobar

- **No se ejecutó la aplicación contra un Supabase real**: no hay credenciales en el
  entorno. Todo lo relativo a Auth, Storage y PostgREST se verificó sobre un PostgreSQL
  equivalente levantado con el arnés del propio repositorio, no contra producción.
- **No se ejecutaron las pruebas E2E de Playwright**: exigen un entorno de staging con
  usuarios sembrados (`E2E_ADMIN_EMAIL`, etc.). Su código se leyó; su ejecución, no.
- **No se auditó la configuración externa** (variables en Vercel/Render/Supabase, claves
  rotadas, monitores de Better Stack). Vive fuera del repositorio.
