# Estado y próximos pasos

Punto de retomada. Última actualización: **2026-08-25**.

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
-- Migraciones aplicadas: deben ser 79, la última 20260824000003
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

## Hallazgos abiertos del despliegue

### H-1 · Dos caminos de migración hacia producción

`ci-migrate.py` registró `Remote: 79 migration(s) already applied` y
`0 migration(s) applied`. Los logs de Postgres sitúan las 11 migraciones a las
01:10:06 — 46 segundos antes de que corriera el workflow — precedidas de
`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations`, preámbulo
de la **integración nativa de Supabase con GitHub**, no del script.

Es decir: la integración las aplicó al fusionar y el workflow llegó a no hacer
nada. Hoy es inocuo (ambos son idempotentes y comparten la tabla de versiones),
pero son dos mecanismos escribiendo el esquema sin saber el uno del otro. Si
alguna vez difieren en orden o en qué consideran pendiente, gana quien llegue
primero. **Dejar uno solo** — preferiblemente el workflow, que respeta el gate
de CI y deja rastro en el log.

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

Arreglo propuesto, no aplicado: migración `REVOKE TRUNCATE ON ALL TABLES IN
SCHEMA public FROM anon, authenticated`, el `DELETE` de los tres objetos
sueltos, y `ALTER DEFAULT PRIVILEGES` para que las tablas futuras nazcan sin
ese permiso. Puramente restrictiva, rollback trivial.

### H-3 · La app en vivo no se verificó

El entorno remoto donde se hizo el despliegue tiene bloqueado `vercel.app` por
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

1. **Rotar `SUPABASE_SERVICE_ROLE_KEY`** (urgente). La usa `createAdminClient()`
   en el camino de entrega de pedidos.
2. **Poner `BACKUP_GPG_PASSPHRASE`** en los secretos de GitHub. El workflow de
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

3. Rotar `SUPABASE_JWT_SECRET` cuando `ALLOW_LEGACY_HS256` quede apagado.
4. Monitor HTTP contra `/health` en Better Stack, y un heartbeat del respaldo
   (que avise cuando el workflow lleve más de 24 h sin éxito — es justo lo que
   habría destapado el punto 2 hace un mes).

Hechas el 2026-08-22 por el dueño:

- ✅ CAPTCHA nativo de Supabase Auth activado. Obligó a cambiar el login: el
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
2. **Cerrar H-2** (`REVOKE TRUNCATE` + los tres `DELETE` sueltos). Media hora,
   puramente restrictiva, y cierra la incoherencia que dejó la remediación.
3. **Cerrar H-1**: decidir un solo camino de migración y desconectar el otro.
4. **Flujos A y B** (separar pedido de mesa de reposición de barra). Es lo que
   de verdad resuelve F-026, el único hallazgo de la auditoría que sigue
   abierto, y ahora es posible porque F-037 ya materializa el stock de barra.
5. **Flujo C · conteo de barra al cierre de turno**. Depende de 1 y 4.

Los pendientes de configuración de la sección anterior van en paralelo y no los
puede hacer una sesión de Claude: requieren acceso a los dashboards.
