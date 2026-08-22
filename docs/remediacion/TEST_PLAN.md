# Plan de pruebas — remediación 2026-08-22

## Por qué existía el problema

Antes de la remediación el repositorio tenía 354 pruebas en verde, lint limpio y
typecheck limpio, y aun así convivía con una escalada a superuser, un bypass del
Principio Rector y dos módulos rotos. La razón es dónde estaban las pruebas:

- `coverage.include` medía solo `src/modules/*/domain/**`. El umbral del 75 % se
  calculaba sobre una fracción pequeña del código ejecutable.
- **Cero pruebas** sobre `assertCan`, el middleware, el camino QR y, sobre todo,
  las políticas RLS y las RPC `SECURITY DEFINER`, que son la última línea de
  defensa.

Una suite verde sobre el dominio puro no dice nada sobre quién puede escribir qué
en Postgres.

## Las dos capas de prueba

### 1. Unitarias e integración (vitest)

507 pruebas: 394 en web, 45 en validación, 44 en tipos compartidos, 24 en el
socket-server. Cubren dominio, casos de uso, Server Actions con dobles, y ahora
también autorización, CSP, rutas públicas y el camino QR.

```bash
pnpm test
pnpm --filter @dorado/web exec vitest run --coverage
```

### 2. RLS y RPC contra Postgres real (`scripts/sql-harness`)

Esta capa no existía. Aplica las 76 migraciones sobre una base limpia, carga un
fixture determinista y ejecuta cada prueba en su propia transacción, que se
revierte al terminar.

```bash
./scripts/sql-harness/run-tests.sh
```

Cada prueba simula una sesión real de PostgREST: fija `request.jwt.claims` y
`SET LOCAL ROLE authenticated`, igual que hace Supabase. Eso permite afirmar
cosas que ningún mock puede afirmar, como «un mesero no puede marcar entregado».

| Suite                                   | Qué garantiza                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `f001_signup_no_escala_privilegios`     | El signup no fija sus propios claims; el aprovisionamiento server-side sí funciona y rechaza `superuser` y tenants inexistentes. |
| `f002_principio_rector`                 | Ningún rol marca un pedido entregado por escritura directa.                                                                      |
| `f002_sin_borrado_duro`                 | `DELETE` denegado en 14 tablas × 3 roles.                                                                                        |
| `f004_turno_en_ledger`                  | El movimiento queda vinculado al turno, la vista proyecta filas, y existe **una sola** firma de FEFO.                            |
| `f005_analytics_refrescable`            | El refresco funciona sobre una vista sin poblar y es idempotente.                                                                |
| `f006_roles_produccion_pueden_escribir` | Los tres roles de cocina crean **y avanzan** tandas; el mesero no.                                                               |
| `f008_entrega_atomica`                  | Camino feliz, stock insuficiente, conflicto de versión y guarda de zona: en los tres fallos **no queda stock descontado**.       |
| `f009_transicion_item_atomica`          | Un conflicto de versión deja el ítem intacto y sin evento; la guarda de área se aplica en base.                                  |
| `f021_costos_por_lote`                  | Resultado por lote y guard cross-tenant conservado.                                                                              |
| `f022_merma_atomica`                    | Descuento y registro juntos; reversión total ante fallo; permiso exigido.                                                        |
| `f036_insert_exige_permiso`             | Un rol sin `inventory:write` no inserta lotes, insumos, recetas ni proveedores; el que lo tiene sí; nunca en tenant ajeno.       |

### Requisitos del arnés

Un PostgreSQL accesible. En CI es un servicio `postgres:15` (job `rls`). En local,
un cluster efímero con `initdb`/`pg_ctl`; el script acepta `PGROOT` (socket) o las
`PG*` estándar. **No usa Docker ni `supabase start`**, en línea con CLAUDE.md.

`scripts/sql-harness/00_supabase_shim.sql` reproduce lo que Supabase aporta de
fábrica: schema `auth`, `auth.jwt()`/`auth.uid()`, los roles `anon`,
`authenticated` y `service_role`, y stubs de `pg_cron`, `pg_net` y `vault`.

## Regla permanente

**Cada defecto corregido dejó una prueba que falla si vuelve.** Todas las suites
de RLS se escribieron en rojo antes del fix y se verificó su fallo. Dos de ellas
detectaron errores en la propia corrección antes de llegar al commit:

- el manejador de `f005` capturaba `55000` cuando PostgreSQL lanza `0A000`;
- el fixture de `f001` reveló que el seed dependía del trigger que se estaba
  eliminando.

## Lo que sigue sin cobertura

- Los 127 componentes React: sin pruebas de renderizado ni de accesibilidad.
- Los 10 specs de Playwright existen pero no se ejecutaron en esta remediación
  (requieren secretos y un proyecto Supabase de staging).
- `scripts/**` y `supabase/seed.sql`.
