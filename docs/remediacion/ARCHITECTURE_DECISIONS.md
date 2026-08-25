# Decisiones de arquitectura — remediación 2026-08-22

## ADR-001: Las invariantes críticas viven en la base de datos

**Contexto.** Las reglas de negocio (máquina de estados, área del ítem, zona del
rol, descuento FEFO) se aplicaban únicamente en las Server Actions. PostgREST es
alcanzable directamente por cualquier navegador autenticado con la anon key, que
es pública. Verificado: un mesero marcaba un pedido como entregado sin descontar
un solo gramo de stock.

**Decisión.** Toda la escritura de pedidos pasa por RPCs `SECURITY DEFINER` que
autorizan y validan dentro de su propia transacción, y se revoca el privilegio de
tabla para `authenticated`.

**Tensión con Clean Architecture.** Uncle Bob dice que las reglas de negocio no
deben depender del framework ni de la base. Aquí se han movido _a_ la base. La
razón: la atomicidad y la no-eludibilidad son propiedades que solo el motor
transaccional puede garantizar. Una regla que el cliente puede saltarse no es una
regla. Se acepta el coste —parte de la lógica ya no es testeable con vitest— y se
compensa con el arnés de RLS, que la prueba contra Postgres real.

**Consecuencia.** `calcular-descuentos.ts` e `item-estado.ts` se eliminaron. Eran
una segunda definición de reglas que ahora viven en SQL, y mantener dos
definiciones es exactamente la deriva que originó estos hallazgos.

## ADR-002: Una sola fuente de verdad para la matriz de permisos

**Contexto.** Existían dos definiciones de quién puede qué: `PERMISSIONS` en
TypeScript (viva, con pruebas) y las listas de roles escritas a mano dentro de
cada política RLS (congeladas en el modelo de mayo de 2026). La segunda nunca se
actualizó tras el refoco operacional.

**Decisión.** La tabla `rbac_permisos` se **genera** desde `PERMISSIONS`
(`pnpm rbac:generate`) y una prueba de vitest falla si alguien cambia una sin
regenerar la otra. Las políticas consultan `fn_puede()` en lugar de repetir listas.

**Alternativa descartada.** Mantener las listas sincronizadas a mano con una
checklist. Es lo que había, y falló.

## ADR-003: El QR tiene su propia RPC de alta

**Contexto.** El pasajero es anónimo: su credencial es el token de mesa, no un
JWT de Supabase. `fn_crear_pedido` deriva la autorización de `auth.jwt()`, así
que el camino QR no puede usarla.

**Decisión.** `fn_crear_pedido_qr`, concedida solo a `service_role`, con la misma
atomicidad. El **ruteo por área se calcula en TypeScript** (`rutearPedido`, la
misma función del alta interna) y llega resuelto en el parámetro, para no crear
una segunda definición de `ZONA_AREAS_PERMITIDAS` dentro de SQL.

## ADR-004: Las políticas de lectura no se estrechan

**Contexto.** Al reescribir las políticas se planteó exigir permiso también en
SELECT (por ejemplo, `inventory:read` para leer `insumos`).

**Decisión.** No hacerlo. Las políticas de SELECT siguen siendo por tenant.

**Razón.** El vector explotado era la escritura. Estrechar las lecturas rompería
flujos legítimos —un `mesero_amex` necesita leer los ingredientes de la receta al
entregar, y no tiene `inventory:read`— a cambio de un beneficio marginal: leer el
catálogo de la propia sala no es el riesgo. Queda registrado como riesgo residual
aceptado en SECURITY_CHANGES.md.

## ADR-005: Dos máquinas de estado sobre `pedidos` — **abierto**

**Contexto.** Conviven dos autoridades sobre `pedidos.estado`:

- el módulo `orders` lo **deriva** del estado agregado de los ítems;
- el módulo `cocina-amex` lo **transiciona directamente** a nivel de pedido.

Como `ZONA_AREAS_PERMITIDAS.amex` incluye `cocina_fria` y `pasteleria`, un pedido
AMEX tiene ítems que se operan desde los KDS por ítem. Ambos caminos incrementan
`version`, así que producen conflictos cruzados, y la derivación puede pisar la
decisión tomada en el KDS AMEX.

**Estado.** Sin resolver. Se documenta y se deja abierto **a propósito**.

**Por qué no se cerró aquí.** Elegir una autoridad cambia cómo trabaja el sous
chef: o el KDS AMEX pasa a operar por ítem como los demás (coherente con el
refoco «despacho por ítem» de CLAUDE.md v6.0, pero altera el flujo de trabajo de
una estación en producción), o se acepta que los pedidos AMEX no deriven su
estado. Es una decisión de producto, no solo técnica, y CLAUDE.md es explícito:
ante cualquier duda, parar y preguntar antes de codificar.

**Propuesta recomendada.** Unificar en el modelo por ítem: es el que ya usan tres
de los cuatro KDS, el que la migración de junio consolidó, y el que deja una sola
definición del estado agregado. Requiere rehacer la UI de `/cocina-amex` para
despachar por ítem y una prueba de integración sobre un pedido AMEX con ítem de
cocina fría.

## ADR-006: El arnés de SQL usa un Postgres desnudo, no Supabase local

**Contexto.** CLAUDE.md prohíbe `supabase start` y Docker local. Sin una base,
las migraciones de RLS y las RPC serían código no probado.

**Decisión.** Un cluster PostgreSQL efímero (`initdb`/`pg_ctl`) más un shim que
reproduce lo que Supabase aporta de fábrica. No es el stack de desarrollo de
Supabase —no levanta PostgREST, GoTrue ni Studio—, es una base desechable para
validar SQL. En CI es el servicio `postgres:15` del job `rls`.

**Limitación conocida.** El arnés corre PostgreSQL 16 en local y 15 en CI; el
proyecto usa 15. Las diferencias no afectan a lo que se prueba (RLS, plpgsql,
grants), pero conviene que CI sea la referencia.

## ADR-007: Un solo camino de migración — la integración nativa de Supabase

**Contexto.** Dos mecanismos aplicaban el esquema sin conocerse: el job
`migrate` de `deploy.yml` (`scripts/ci-migrate.py`, vía Management API) y la
integración nativa de Supabase con GitHub, que aplica al fusionar en `main`.

`supabase_migrations.schema_migrations` fecha el relevo con precisión:

| Aplicador                              | Migraciones | Rango                   | `statements` |
| -------------------------------------- | ----------: | ----------------------- | ------------ |
| `nkofla74@gmail.com` (manual)          |           9 | 2026-05-03              | poblado      |
| `ci-pipeline` (el workflow)            |          53 | 2026-05-04 → 2026-06-11 | **vacío**    |
| integración nativa (`created_by` nulo) |          17 | 2026-06-12 → 2026-08-24 | poblado      |

Es decir: **el workflow no aplicaba una migración desde el 2026-06-11**. Las
últimas 16 —toda la remediación forense incluida— las aplicó la integración. El
hallazgo H-1 original atribuía el solapamiento solo a PR #28; en realidad
llevaba dos meses y medio.

**Decisión.** Se conserva la integración nativa y se retira el job `migrate`
junto con `scripts/ci-migrate.py`.

**Por qué, en contra de la preferencia registrada al detectar H-1.** El
argumento a favor del workflow era que «respeta el gate de CI». No lo respeta:
la integración aplica al fusionar, antes de que `deploy.yml` arranque, así que
el gate nunca tuvo ocasión de detener nada. Y `main` no tenía protección de
rama ni rulesets, de modo que tampoco el merge estaba gateado.

A eso se suma un defecto propio del script que el hallazgo no registraba:
`ci-migrate.py` insertaba `statements = ARRAY[]::text[]`, así que sus 53 filas
**no guardan qué SQL se ejecutó**. Las de la integración sí. Para una base cuya
auditoría es un requisito del proyecto, esa asimetría decide.

**El gate se mueve a la capa correcta.** No se gatea el despliegue: se gatea el
merge. La protección de rama sobre `main` exige CI en verde para fusionar, y si
nada rojo se fusiona, la integración no puede aplicar nada rojo.

**Requisito operativo.** Esta decisión **solo es segura con la protección de
rama activa**. Sin ella se pierde el único gate que queda. Ver
`ESTADO-Y-PROXIMOS-PASOS.md` §Acciones de configuración pendientes.

**Orden preservado.** La integración aplica el esquema al fusionar; el deploy de
la app ocurre minutos después, tras CI. Base primero, aplicación después — que
es el orden que exige una migración aditiva.

**Se pierde.** El workaround de IPv6 de `ci-migrate.py` (el host directo de
Supabase es IPv6-only y los runners de GitHub no lo alcanzan). Deja de hacer
falta: la integración corre del lado de Supabase. Si algún día hubiera que
reintroducir un aplicador propio, el script está en el historial de git —
`git log --diff-filter=D -- scripts/ci-migrate.py`.
