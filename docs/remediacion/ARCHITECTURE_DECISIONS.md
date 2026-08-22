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
