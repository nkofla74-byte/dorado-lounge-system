# Estado y próximos pasos

> ## 📍 Actualización del 2026-08-30 — empieza por aquí
>
> Se ejecutó una **auditoría exhaustiva del repositorio**, verificada por ejecución y no por
> lectura de esta documentación. Su resultado es ahora el estado autoritativo del proyecto:
>
> **→ [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md)** · detalle en `docs/project-audit/` (24 documentos)
>
> **Lo bueno, medido:** las 80 migraciones aplican sobre un Postgres limpio sin un error, las
> 12 suites de RLS pasan, 567 pruebas en verde, typecheck y lint limpios, el build genera las
> 29 rutas y el guardia de sesión funciona en ejecución. Las cuatro consultas de verificación
> que propone este mismo documento (§Cómo retomar) se ejecutaron y **las cuatro coinciden**.
>
> **Lo que no:** cinco defectos funcionales abiertos, ninguno de seguridad.
>
> | ID  | Qué pasa                                                                                                                                   |
> | --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
> | H-A | 🔴 `/analytics` devuelve `permission denied` a cualquier rol. `security_invoker=true` sobre una MV cuyo `SELECT` la misma migración revocó |
> | H-B | 🔴 La analítica del superuser devuelve siempre cero filas (`service_role` sin `tenant_id`)                                                 |
> | H-C | 🟠 `AlertasBell` escucha eventos `ALERTA` sin unirse a ningún canal: no llegan en tiempo real                                              |
> | H-D | 🟠 La vista materializada de analítica no tiene refresco en `pg_cron`                                                                      |
> | H-E | 🟠 El alta de pedidos por QR emite a un solo canal: no despierta AMEX ni pastelería                                                        |
>
> **F-005 se reabrió** en `REMEDIATION_TRACKER.md`: su prueba cubría el refresco de la vista,
> no su lectura.
>
> **Ruta más corta:** prueba en rojo → recrear la vista sin `security_invoker` → `cron.schedule`
> del refresco → camino del superuser → `join` en la campana → canales del QR. Seis cambios,
> ninguno por encima de complejidad «S». Detalle con criterios de aceptación en
> `docs/project-audit/21-roadmap.md` §Fase 1.
>
> Lo que sigue debajo es el punto de retomada del 2026-08-25 y **conserva su valor**: explica
> cómo se llegó aquí. Nada de lo que afirma quedó desmentido, salvo el cierre de F-005.

---

Punto de retomada. Última actualización: **2026-08-25**, después de fusionar
PR #29. Ese día tuvo dos mitades: la madrugada (despliegue de PR #28) y la
mañana (caída del login y su cierre). Si lees esto buscando el estado actual,
salta a §Estado tras PR #29.

Este archivo existe porque la conversación donde se tomaron estas decisiones no
viaja con el repositorio. Si retomas desde otra máquina o con otra sesión, esto
es lo que necesitas saber. **Es la primera lectura**, antes que
`REMEDIATION_TRACKER.md`.

## Cómo retomar desde tu terminal

Las sesiones de Claude Code en la web corren en un contenedor remoto y no se
pueden abrir en local: un `claude` de terminal arranca en frío. Lo que viaja es
el repositorio. Para ponerte al día:

```bash
git fetch origin
git checkout main && git pull origin main     # 90d56b0 o posterior
pnpm install
claude                                        # lee CLAUDE.md + este archivo
```

Y dentro de la sesión, para que cargue el contexto de golpe:

> Lee `docs/remediacion/ESTADO-Y-PROXIMOS-PASOS.md` y dime en qué estamos.

Para comprobar por ti mismo que producción está donde dice este documento, sin
depender de lo que diga nadie:

```sql
-- Migraciones aplicadas: deben ser 80, la última 20260825015658
SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;

-- Matriz RBAC: 144 filas
SELECT count(*) FROM public.rbac_permisos;

-- authenticated NO debe poder escribir pedidos: solo SELECT
SELECT privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='pedidos' AND grantee='authenticated';

-- Políticas FOR ALL: deben ser 0
SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='ALL';
```

## Estado al 2026-08-25

**PR #28 fusionado en `main` (`90d56b0`) y desplegado.** Deploy #90 en verde:
CI Gate, migraciones, Vercel y Sentry Release.

Verificado contra la base de producción después del despliegue:

| Comprobación                    | Antes                | Ahora                             |
| ------------------------------- | -------------------- | --------------------------------- |
| Migraciones registradas         | 68                   | **79** (`20260824000003`)         |
| `rbac_permisos`                 | no existía           | **144 filas**                     |
| RPCs de pedidos + `fn_puede`    | 6 (faltaba entregar) | **7 de 7**                        |
| Políticas `FOR ALL`             | 13                   | **0**                             |
| `authenticated` sobre `pedidos` | INSERT+UPDATE+SELECT | **solo SELECT**                   |
| `recetas.rendimiento_cantidad`  | no existía           | existe · 41 recetas · **0 nulas** |
| `fn_descontar_insumo_fefo`      | 8 argumentos         | **9, con `p_turno_id`** · 1 firma |
| Overloads huérfanos (regla 11)  | —                    | **0** en las 79 migraciones       |

**Base de datos reiniciada** el 2026-08-25 a petición del dueño: la historia
operativa quedó en cero (pedidos, movimientos, lotes, tandas, requisiciones,
turnos, alertas y mermas) y se conservaron catálogo y auditoría — 201 insumos,
58 recetas, 335 ingredientes de receta, 9 proveedores, 14 usuarios, 2 tenants y
las 223 filas de `audit_log`. Los 6 triggers `prevent_mutation` se verificaron
activos después. Respaldo previo: 992 filas en 16 tablas, entregado al dueño
como `respaldo-dorado-20260825.tar.gz` (**fuera del repositorio** — si lo
necesitas, pídeselo).

Los contadores de `tenant_codigo_counters` de tipo `insumo` **no se tocaron** a
propósito: los 236 insumos conservan su código y reiniciarlos habría duplicado
SKUs. Solo se borraron las filas `lote_*`.

## Estado tras PR #29 (2026-08-25, mañana)

**La sala estuvo sin poder entrar al sistema.** Todo intento de login devolvía
«Demasiados intentos. Espera unos minutos» — y esperar no servía de nada, porque
no había ninguna ventana corriendo.

Causa: `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` nunca estuvieron en
Vercel. Sin ellas el limitador es `null`, y `login` está en `failClosedBuckets`
(`rate-limit.ts:53`), así que en producción se **negaba el 100 % de los logins**.
El código no distingue «el contador dice que te pasaste» de «no hay contador», y
el mensaje al usuario decía lo primero cuando pasaba lo segundo.

Por qué apareció justo entonces y no antes: hasta PR #28 el bucket solo se
consumía dentro de `verifyTurnstile`, y solo si había token. Como
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` tampoco está configurada, el widget nunca se
pintaba, nunca había token y el bucket nunca se tocaba. F-012 movió el login al
servidor y lo puso en el camino de **todo** intento. Una pieza que llevaba meses
ausente sin consecuencias se convirtió en un candado de un despliegue al otro.

Resuelto: base Upstash creada (`relevant-guinea-152636.upstash.io`, AWS
us-east-1, free tier), las dos variables puestas en Vercel como Sensitive y solo
en Production, y redespliegue. Login verificado funcionando y el bucket
verificado escribiendo.

Cómo comprobar que el limitador está vivo de verdad y no en fail-open silencioso
—que es el desenlace malo disfrazado de bueno—: tras un login, la clave debe
existir y debe llevar la cuenta dentro.

```bash
curl -s "$UPSTASH_REDIS_REST_URL/keys/rl:login*" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
# rl:login:<ip>:<email>:<ventana>   ← correcto
# rl:login:<ip>:<ventana>           ← código anterior a PR #29
# []                                ← no se está consultando: fail-open
```

**PR #29 fusionado** (`c2d24f2`, 8/8 checks). Cierra H-1, H-2 y el bucket por
IP. Verificado contra producción: **80 migraciones**, la última `20260825015658`,
y la consulta de §H-2 devuelve **0 filas** (antes 56).

### Hallazgos nuevos de esta mañana

**El seed no conocía `rendimiento_cantidad`** y ningún entorno nuevo levantaba.
`Supabase Preview` fallaba con `recetas_produccion_tiene_rendimiento`. La
restricción llegó con F-037 el 24-ago; `seed.sql` no se tocaba desde el 12-jun.
Producción nunca estuvo en riesgo —la integración solo aplica migraciones, no el
seed—, pero **restaurar sobre un esquema limpio estaba roto**, y de eso depende
el plan de recuperación. Arreglado en PR #29.

**Los ficheros de `public/` pasaban por el guardia de sesión.** El matcher del
middleware excluía las imágenes pero no el resto: `/staff-manifest.webmanifest`,
`/manifest.webmanifest` y `/sw.js` respondían `302 → /login`. El navegador pide
manifest y service worker **sin cookies**, así que se veían como anónimos. El
modo offline del QR de pasajeros (Sprint 6) llevaba muerto desde que existe ese
matcher, sin que nada fallara en voz alta.

**El script de tema de next-themes no llevaba nonce** y la CSP de F-019 lo
bloqueaba. Es el que fija el tema antes del primer pintado: sin él la página
aparece con el tema equivocado hasta que React hidrata. De 27 scripts, 26 tenían
nonce y ese no. Se le pasa desde el layout con `x-nonce`.

### Aviso operativo

`vercel ls --prod` devuelve las URLs **sin ordenar y sin fechas**. Tomar la
primera por «la más reciente» es un error: el 2026-08-25 eso publicó en
producción un build de hacía 72 días. Pedir siempre la lista con la columna
`Age` y confirmar la fecha **antes** de redesplegar, no después.

Y después de cualquier despliegue, el personal debe recargar con `Ctrl+Shift+R`:
Next.js regenera los IDs de Server Action en cada build, y un navegador con la
app anterior en caché falla con `UnrecognizedActionError`.

## Hallazgos abiertos del despliegue

### H-1 · Dos caminos de migración hacia producción — CERRADO Y DESPLEGADO (PR #29)

⚠ **Queda una acción del dueño**: proteger `main`. Ver más abajo.

**Validado en el merge de PR #29** (2026-08-25, `c2d24f2f`): fue el primer merge
sin el job `migrate`, y la integración nativa aplicó la migración 80 ella sola.
ADR-007 funciona. Lo que sigue sin existir es la red debajo: `main` no tiene
protección de rama, así que hoy nada exige CI en verde para fusionar. Salió bien
por el contenido del PR, no porque algo lo garantizara.

`ci-migrate.py` registró `Remote: 79 migration(s) already applied` y
`0 migration(s) applied`. Los logs de Postgres sitúan las 11 migraciones a las
01:10:06 — 46 segundos antes de que corriera el workflow — precedidas de
`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations`, preámbulo
de la **integración nativa de Supabase con GitHub**, no del script.

**El alcance real era mayor que esto.** `schema_migrations` fecha el relevo:

| Aplicador                              | Migraciones | Rango                   | `statements` |
| -------------------------------------- | ----------: | ----------------------- | ------------ |
| `nkofla74@gmail.com` (manual)          |           9 | 2026-05-03              | poblado      |
| `ci-pipeline` (el workflow)            |          53 | 2026-05-04 → 2026-06-11 | **vacío**    |
| integración nativa (`created_by` nulo) |          17 | 2026-06-12 → 2026-08-24 | poblado      |

No era un solapamiento de PR #28: **el workflow no aplicaba una migración desde
el 2026-06-11**. Las últimas 16 las aplicó la integración. El gate de CI llevaba
dos meses y medio sin gatear nada, porque la integración aplica al fusionar,
antes de que `deploy.yml` arranque.

Y había un segundo agujero, no registrado entonces: **`main` no tenía protección
de rama ni rulesets** (`gh api .../branches/main/protection` → 404,
`.../rulesets` → `[]`). Nada exigía CI en verde para fusionar.

**Decisión (ADR-007): se conserva la integración nativa.** Contradice la
preferencia apuntada arriba —«preferiblemente el workflow, que respeta el gate
de CI»— porque la premisa era falsa: no lo respetaba. Y `ci-migrate.py` insertaba
`statements = ARRAY[]::text[]`, así que sus 53 filas no guardan qué SQL se
ejecutó; las de la integración sí.

Hecho en el repositorio: retirado el job `migrate` de `deploy.yml` y borrado
`scripts/ci-migrate.py` (recuperable con
`git log --diff-filter=D -- scripts/ci-migrate.py`).

**El gate se mueve al merge, que es la capa correcta**: si nada rojo puede
fusionarse, la integración no puede aplicar nada rojo. Eso exige la protección
de rama, que es la acción pendiente del dueño y **sin la cual esta decisión deja
la base sin ningún gate**.

### H-2 · `TRUNCATE` sigue concedido a `anon` y `authenticated`

En las 25 tablas de `public`. `TRUNCATE` **ignora la RLS por completo**.

No es explotable por la vía pública: PostgREST no expone ese verbo, haría falta
conexión directa a Postgres con la contraseña de la base. Pero es incoherente
con la revocación de `DELETE` que se desplegó en esta misma remediación.

`DELETE` además sigue vivo en 5 objetos: `audit_log` y `domain_events` (cubiertos
por sus triggers de inmutabilidad), más `operaciones_idempotentes`,
`tenant_codigo_counters` y una vista — estos sin protección de trigger, y
`tenant_codigo_counters` es justo el contador de SKU/lote que CLAUDE.md marca
como «solo RPC».

**CERRADO Y VERIFICADO EN PRODUCCIÓN (PR #29, 2026-08-25).** La consulta de
verificación de abajo devuelve **0 filas**; antes del merge devolvía 56.
Migración
`20260825015658_cerrar_truncate_y_delete_sueltos.sql`: `REVOKE TRUNCATE ON ALL
TABLES IN SCHEMA public FROM anon, authenticated`, el `DELETE` de los tres
objetos sueltos, y `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` para que las
tablas futuras nazcan sin ese permiso. Puramente restrictiva, rollback trivial.

Un detalle que se verificó antes de escribirla: `TRUNCATE` no solo ignora la
RLS, tampoco dispara los triggers `prevent_mutation()` —son `FOR EACH ROW`, y
`TRUNCATE` nunca los ejecuta—, así que `audit_log` y `domain_events` estaban
expuestas pese a su inmutabilidad. El `ALTER DEFAULT PRIVILEGES` se limita a
`FOR ROLE postgres`: es el rol que crea las tablas, y `postgres` no es miembro
de `supabase_admin` (comprobado en `pg_auth_members`), así que declararlo para
ese segundo rol habría fallado por permisos.

Verificar tras el despliegue:

```sql
-- Debe devolver 0 filas
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
  AND (privilege_type = 'TRUNCATE'
       OR (privilege_type = 'DELETE'
           AND table_name NOT IN ('audit_log','domain_events')));
```

### H-3 · La app en vivo no se verificó — CERRADO (2026-08-25)

`curl` desde la máquina del dueño: **`/health` responde 200**. La app está viva.

Contexto original: el entorno remoto donde se hizo el despliegue tiene bloqueado `vercel.app` por
política de red (403 al CONNECT del proxy). Consta que el deploy terminó bien,
**no** que `/health` responda. Comprobación pendiente del dueño:

```bash
curl -i https://dorado-lounge-system-web.vercel.app/health
```

## Dónde está el trabajo

Todo fusionado en `main`. La rama `claude/forensic-repository-audit-bzupi6`
quedó reiniciada desde `main` para el trabajo siguiente.

## Qué se hizo

Remediación completa de la auditoría forense 2026-08-22: **35 de 36 hallazgos
cerrados**, cada uno con prueba de regresión. Ver `REMEDIATION_TRACKER.md` para
el detalle y `CHANGELOG_REMEDIATION.md` para el commit a commit.

Además, en la misma tanda: rediseño visual completo (sistema de tokens en
`globals.css`, escala tipográfica fluida, `TabBar` accesible compartida, objetivos
táctiles de 56 px en KDS y almacén) y el cierre de F-037. Las 10 skills de diseño
viven en `.claude/skills/`; `dorado-design-system` es la autoridad.

Lo que cambió estructuralmente y conviene tener presente antes de tocar código:

- **La escritura de pedidos ya no se hace con UPDATE directo.** `authenticated`
  no tiene INSERT ni UPDATE sobre `pedidos` ni sus tablas hijas. Todo pasa por
  RPCs (`fn_pedido_transicion`, `fn_entregar_pedido`, `fn_transicionar_item`,
  `fn_pedido_asignar_cocinero`, `fn_crear_pedido`, `fn_crear_pedido_qr`).
  Añadir un `.update()` sobre `pedidos` desde la app fallará por privilegios.
- **La matriz de permisos se genera.** Editar `lib/auth/permissions.ts` y
  ejecutar `pnpm rbac:generate`. Una prueba de vitest falla si se cambia una sin
  regenerar la otra.
- **Sin borrado físico.** `DELETE` revocado en las 20 tablas operativas.
- **Hay una segunda capa de pruebas**: `./scripts/sql-harness/run-tests.sh`
  aplica las migraciones sobre un Postgres limpio y prueba las políticas RLS y
  las RPC de verdad. Ver `scripts/sql-harness/README.md` para levantarlo local.

## Decisiones tomadas en conversación

Estado indicado en cada una.

### D-1 · No se divide el software — vigente

Se evaluó separar AMEX del Dorado Lounge en dos sistemas y **se descartó**.
Razón: cocina fría y pastelería sirven a las tres zonas, y hay un solo almacén
con un solo juego de lotes y un solo FEFO. Dividir obligaría a partir un almacén
físico en dos bases de datos.

Si en el futuro la operación sí se separa (almacén propio, personal propio), la
respuesta correcta son **dos tenants en el mismo sistema**, no dos repositorios:
la multi-tenencia ya existe y desde esta remediación está aplicada en la base.

### D-2 · AMEX pasa a llamarse Dorado Prefer — pendiente

Rebranding: cambia el nombre y el diseño visual, **la lógica se conserva
idéntica**. No se toca el ruteo por área, ni el KDS, ni el inventario.

Huella medida: 89 archivos, 300 menciones en aplicación, 43 en SQL, 14 en tipos
compartidos. `amex` es valor de 4 enums de PostgreSQL (`zona_servicio`,
`area_produccion`, `user_role` vía `mesero_amex`, `tipo_acceso_sala`), aparece en
2 constraints CHECK, en la ruta `/cocina-amex` y en los canales `sala:amex` y
`sala:cocina:amex`.

Dos detalles que **hay que planificar** antes de renombrar:

1. **QR impresos.** Los tokens de mesa llevan `zona: 'amex'` y duran 12 h. Al
   renombrar el enum, los tokens vigentes dejan de validar. Hay que mapear el
   valor antiguo en `verifyMesaToken` durante la transición, o asumir una ventana
   de QR muertos.
2. **`tipo_acceso_sala` NO se renombra.** Los otros tres enums nombran espacios
   físicos; renombrarlos no falsea nada. Pero `tipo_acceso_sala` registra por qué
   convenio entró el pasajero. El convenio American Express termina y entra
   Dorado Prefer, así que **el valor `amex` se conserva** (para no reescribir el
   pasado) y se **añade `prefer`** al lado.

En SQL el renombrado es barato: `ALTER TYPE ... RENAME VALUE` es una operación de
catálogo, instantánea, sin reescritura de tablas.

### D-3 · Rediseño visual — HECHO (desplegado 2026-08-25)

Se ejecutó y está en producción. Base en `apps/web/src/app/globals.css`: tres
ejes de color (`senal-*` para estado, `area-*` para nodo, `zona-*` para origen)
más la paleta Prefer, escala tipográfica fluida en `tailwind.config.ts`, `TabBar`
compartida con contrato ARIA completo, y objetivos táctiles de 56 px en KDS y
almacén (no los 44 pt del HIG: se opera con guantes).

El contraste WCAG AA está **medido, no supuesto** —29 pares de tokens en ambos
temas— y hay una prueba permanente que lee el `globals.css` real:
`apps/web/src/components/design/tests/contraste.test.ts`. Si alguien cambia un
token y rompe el 4.5:1, la prueba falla.

Antes de tocar cualquier UI, leer la skill `dorado-design-system`: fija la
precedencia sobre las `apple-*` y traduce sus reglas nativas a este stack. Dos
que se rompen a menudo: **SF Symbols no puede embeberse en una web** (fuente con
licencia de Apple — aquí se usa `lucide-react`) y el mínimo táctil de 56 px.

Queda pendiente de diseño, sin bloquear nada: fotografía de platos, validación en
dispositivo real de cocina, y el rediseño de composición de las pantallas que aún
no se tocaron.

## Pendiente funcional (en pausa, no perdido)

### F-026 · Dos máquinas de estado sobre `pedidos` — abierto

`orders` deriva `pedidos.estado` del estado agregado de los ítems;
`cocina-amex` lo transiciona directo a nivel de pedido. Como la zona AMEX puede
pedir a `cocina_fria` y `pasteleria`, un mismo pedido se opera desde dos sitios y
ambos incrementan `version`.

Síntomas: errores 409 «recarga e intenta de nuevo» en pedidos con postre, y
estado del pedido que no corresponde con lo que muestran las pantallas.
**No corrompe datos** (las RPC usan `FOR UPDATE`): es fricción operativa.

Diagnóstico afinado en conversación: el choque no venía del diseño del KDS, sino
de meter **reposiciones de barra** donde solo debería haber **pedidos de mesa**.
Se resuelve con los flujos A y B de abajo. Ver `ARCHITECTURE_DECISIONS.md`
§ADR-005.

### Flujos A y B · Separar pedido de mesa de reposición de barra

La operación real tiene dos naturalezas que hoy comparten la misma caja:

|                | **A · Pedido de mesa**                    | **B · Reposición de barra**           |
| -------------- | ----------------------------------------- | ------------------------------------- |
| Origen         | Pasajero por QR, o mesero pidiendo por él | Mesero / encargado                    |
| Número de mesa | Sí                                        | No                                    |
| Qué se pide    | Platos de carta (posta cartagenera)       | Elaboraciones (amasijos, postres)     |
| Coordina       | Sous chef, vista de pedido completo       | Va directo al área, como snack/buffet |
| Inventario     | Descuento FEFO al entregar                | Ya descontado al completar la tanda   |

Hallazgos concretos que respaldan esto:

- `pedidos.origen` (`'mesero'` / `'qr_pasajero'`) existe desde mayo pero es
  **decorativo**: ningún comportamiento depende de él.
- El mesero **no tiene** con qué pedir reposición: `/pedidos` solo le ofrece
  `getCartaServicio()`. Snack y buffet sí tienen `getCartaElaboraciones(zona)` +
  `getTandasDisponiblesZona(zona)`. La asimetría obliga al mesero a disfrazar una
  reposición de pedido de mesa.
- El mesero **no ve lo mismo que el pasajero**: `getMenuPublico` filtra
  `activo = true` + `categoria_menu` no nula; `getCartaServicio` no filtra
  ninguna de las dos. Ojo al corregirlo: `carta-amex.tsx` usa esa misma lista
  para el toggle de disponibilidad, así que necesita ver las inactivas — lo que
  hay que impedir es **pedirlas**, no mostrarlas.

Plan acordado:

1. Columna `tipo_pedido` en `pedidos` (`mesa` / `reposicion_barra`), backfill de
   lo existente a `mesa`.
2. Igualar la carta del mesero al menú QR para lo que es _pedible_.
3. Dar al mesero la superficie de reposición reutilizando el componente de
   snack/buffet.
4. El KDS AMEX filtra `tipo_pedido = 'mesa'`.

### F-037 · La capa 2 nunca se materializa — RESUELTO y DESPLEGADO (2026-08-25)

`recetas.insumo_destino_id` existe, es obligatorio para recetas de producción y
un trigger valida que apunte a un insumo de `capa_2`. Pero `fn_completar_tanda`
descuenta los ingredientes de capa 1 y **nunca crea el lote del producto
elaborado**. La aplicación solo lee ese campo en el CRUD de recetas.

CLAUDE.md documenta «capa_1 → capa_2». La flecha no está implementada.

Verificado empíricamente contra Postgres real: al completar una tanda, la harina
baja de 1000 a 900 g y el producto elaborado sigue en **0, sin ningún lote**.

Consecuencia: los amasijos y postres terminados **no existen como stock**. No se
sabe cuántos hay, no hay de qué descontar lo que se consume, y no se puede mermar
lo que se bota.

Es prerrequisito del **flujo C · conteo de barra al cierre de turno**, que el
dueño definió así: lo que sobra se conserva si está fresco y se descarta como
merma si no — decisión por producto **en el momento del conteo**, no una
propiedad fija de la receta.

#### Causa raíz y arreglo

La causa no era la función: **el modelo no sabía expresar cuánto produce una
receta**. `recetas` tenía `insumo_destino_id` (qué se produce) pero ningún campo
de rendimiento (cuánto). Sin cantidad no hay lote posible, así que
`fn_completar_tanda` no podía materializar la salida aunque se le añadiera el
INSERT.

Tres migraciones:

| Migración        | Qué hace                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `20260824000001` | Añade `'produccion'` a `tipo_movimiento`. Va sola porque PostgreSQL no deja usar un valor de enum en la misma transacción que lo crea. |
| `20260824000002` | **Causa raíz**: `recetas.rendimiento_cantidad`, backfill desde `porciones` y CHECK que lo exige en toda receta de producción.          |
| `20260824000003` | `fn_completar_tanda` crea el lote del elaborado, calcula su costo desde el ledger de la propia transacción y registra el movimiento.   |

Decisiones que quedaron documentadas en el propio SQL:

- **La unidad no se declara**: es la del insumo destino. Un segundo campo de
  unidad sería una segunda fuente de verdad.
- **El costo es real, no estimado**: se reconstruye de los movimientos que la
  FEFO acaba de escribir, donde consta de qué lote salió cada gramo y a qué
  precio. Si los insumos no tenían costo, el elaborado queda sin costo en vez de
  inventarse un cero.
- **Sin fecha de vencimiento**: lo que sobra se decide en el conteo de cierre,
  no por una caducidad fija. Ponerle fecha habría inventado una regla que el
  dueño no definió así.
- **`merma_default` no se aplica** a la salida: esa merma es la de recepción de
  compra (Principio Rector) y aplicarla aquí la contaría dos veces. El
  rendimiento que declara el chef ya es neto.
- **Falla en cerrado**: una receta de producción sin rendimiento hace que
  completar la tanda devuelva `RECETA_SIN_RENDIMIENTO` **antes** de tocar el
  stock, en lugar de consumir capa 1 sin producir capa 2.

Verificado con `scripts/sql-harness/run-tests.sh`: primero en rojo reproduciendo
el fallo (0 lotes de capa 2), después en verde. 12/12 suites.

#### ⚠ Acción pendiente del dueño: revisar los rendimientos

El backfill copió `porciones` porque es el único dato existente que se aproxima.
**Es una suposición, no un dato.** Toda receta de producción anterior debe
revisarse con el chef; las que quedaron en el valor por defecto darán 1 unidad
por tanda y un costo unitario desorbitado:

```sql
SELECT id, nombre, porciones, rendimiento_cantidad
FROM public.recetas
WHERE tipo_receta = 'produccion' AND deleted_at IS NULL
ORDER BY rendimiento_cantidad;
```

## Acciones de configuración pendientes (fuera del repositorio)

Detalle en `SECURITY_CHANGES.md` §Pendiente de configuración.

Pendientes, en orden de urgencia:

0. **Poner `BACKUP_GPG_PASSPHRASE`** — es lo más grave que queda abierto; ver
   punto 3, que sigue vigente palabra por palabra. Y con el seed ya arreglado
   (PR #29), **probar una restauración de verdad**: que el workflow termine en
   verde no prueba que el respaldo sirva.

1. **Rotar `SUPABASE_SERVICE_ROLE_KEY`** (urgente). La usa `createAdminClient()`
   en el camino de entrega de pedidos. Rotar también el **token de Upstash**,
   que pasó por una conversación el 2026-08-25.
2. **Proteger la rama `main`** exigiendo CI en verde para fusionar. Hoy no tiene
   protección ni rulesets, y desde ADR-007 es **el único gate que queda** entre
   una migración rota y producción: la integración de Supabase aplica el esquema
   al fusionar, así que lo que gatea el merge gatea la base.

   ```bash
   gh api -X PUT repos/:owner/:repo/branches/main/protection \
     -H "Accept: application/vnd.github+json" \
     -f 'required_status_checks[strict]=true' \
     -f 'required_status_checks[contexts][]=CI' \
     -f 'enforce_admins=false' \
     -f 'required_pull_request_reviews=null' \
     -f 'restrictions=null'
   ```

   Ajustar el nombre del check (`CI`) al que aparezca en la pestaña Actions.
   Con `enforce_admins=false` el dueño conserva la vía de escape para un
   hotfix; ponerlo en `true` si se quiere cerrar del todo.

3. **Poner `BACKUP_GPG_PASSPHRASE`** en los secretos de GitHub. El workflow de
   respaldo lleva **30 días consecutivos fallando** con
   `gpg: error creating passphrase: Invalid passphrase` porque el secreto está
   vacío. La exportación desde Supabase sí funciona; lo que falla es el cifrado,
   así que **hace un mes que no hay copia utilizable**.

   ```bash
   openssl rand -base64 32     # generar; guardarla en un gestor de contraseñas
   ```

   Añadirla como secreto `BACKUP_GPG_PASSPHRASE` y relanzar el workflow a mano.
   Para descifrar después:

   ```bash
   gpg --batch --passphrase "$BACKUP_GPG_PASSPHRASE" -d respaldo.sql.gz.gpg \
     | gunzip | psql "$DATABASE_URL"
   ```

   ⚠ Si se pierde la passphrase, **todos los respaldos cifrados con ella quedan
   ilegibles**. No hay recuperación.

4. Rotar `SUPABASE_JWT_SECRET` cuando `ALLOW_LEGACY_HS256` quede apagado.
5. Monitor HTTP contra `/health` en Better Stack, y un heartbeat del respaldo
   (que avise cuando el workflow lleve más de 24 h sin éxito — es justo lo que
   habría destapado el punto 3 hace un mes).

Hechas el 2026-08-22 por el dueño:

- ❌ **CAPTCHA nativo de Supabase Auth — SE DIO POR HECHO Y NO LO ESTÁ.**
  Comprobado el 2026-08-25 contra el endpoint real con una cuenta inexistente:
  responde `invalid_credentials`, no `captcha_failed`. Y `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  tampoco está en Vercel, así que **hoy no hay CAPTCHA en ninguna capa del login**.
  Esto importa dos veces: es la mitigación que el commit del bucket IP+cuenta
  daba por existente frente al password spraying, y es la razón por la que el
  login no se rompió al arreglar el rate limit (si el CAPTCHA hubiera estado
  activo, Supabase habría rechazado todo por falta de token).
  **Orden obligatorio al activarlo**: primero `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y
  `TURNSTILE_SECRET_KEY` en Vercel + redeploy, y solo después el interruptor en
  Supabase. Al revés se vuelve a romper el login entero.
  Lo que sí se hizo el 2026-08-22 fue preparar el código para ello: el
  token de Turnstile es de un solo uso, así que `iniciarSesion` dejó de
  validarlo contra Cloudflare y lo reenvía a Supabase en
  `options.captchaToken`. Sin ese cambio el login quedaba roto.
  **Verificar en el dashboard que el proveedor sea Cloudflare Turnstile y que
  el secreto sea el mismo `TURNSTILE_SECRET_KEY` del proyecto.**
- ✅ Registro público deshabilitado.

## En qué trabajar ahora — orden propuesto

Ordenado por lo que desbloquea, no por dificultad.

1. **Revisar los 19 rendimientos con el chef** (consulta SQL en F-037 arriba).
   Es dato de negocio que ahora mismo es una suposición, y de él dependen el
   stock de elaborados y todos los costos unitarios. Bloquea cualquier análisis
   de costos que se haga encima.
2. ~~**Cerrar H-2**~~ — ✅ desplegado y verificado en producción (PR #29): la
   consulta de §H-2 devuelve 0 filas.
3. ~~**Cerrar H-1**~~ — ✅ desplegado y validado: el merge de PR #29 fue el
   primero sin el job `migrate` y la integración nativa aplicó sola.
   **Sigue faltando proteger `main`**, sin lo cual la base no tiene ningún gate.
   Es el punto 2 de las acciones de configuración.
4. **Flujos A y B** (separar pedido de mesa de reposición de barra). Es lo que
   de verdad resuelve F-026, el único hallazgo de la auditoría que sigue
   abierto, y ahora es posible porque F-037 ya materializa el stock de barra.
5. **Flujo C · conteo de barra al cierre de turno**. Depende de 1 y 4.

Los pendientes de configuración de la sección anterior van en paralelo y no los
puede hacer una sesión de Claude: requieren acceso a los dashboards.

## Verificado tras el despliegue de PR #29 (2026-08-25)

Ya no queda nada pendiente de este lote. Medido contra producción después del
merge `c2d24f2f`:

- La consulta de §H-2 devuelve **0 filas** (antes 56).
- `schema_migrations` tiene **80** migraciones, la última `20260825015658`.
- El workflow `Deploy` ya no tiene job `Supabase Migrations`: la cadena es
  `CI Gate → Deploy Web → Sentry Release`.
