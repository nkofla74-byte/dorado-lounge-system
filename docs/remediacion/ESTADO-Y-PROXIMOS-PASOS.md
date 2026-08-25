# Estado y próximos pasos

Punto de retomada. Última actualización: 2026-08-22.

Este archivo existe porque la conversación donde se tomaron estas decisiones no
viaja con el repositorio. Si retomas desde otra máquina o con otra sesión, esto
es lo que necesitas saber.

## Dónde está el trabajo

Rama `claude/forensic-repository-audit-bzupi6`, 10 commits sobre `4ff9b70`.
Sin PR abierto todavía.

```bash
git fetch origin
git checkout claude/forensic-repository-audit-bzupi6
pnpm install
```

## Qué se hizo

Remediación completa de la auditoría forense 2026-08-22: **35 de 36 hallazgos
cerrados**, cada uno con prueba de regresión. Ver `REMEDIATION_TRACKER.md` para
el detalle y `CHANGELOG_REMEDIATION.md` para el commit a commit.

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

## Decisiones tomadas en conversación (aún no implementadas)

### D-1 · No se divide el software

Se evaluó separar AMEX del Dorado Lounge en dos sistemas y **se descartó**.
Razón: cocina fría y pastelería sirven a las tres zonas, y hay un solo almacén
con un solo juego de lotes y un solo FEFO. Dividir obligaría a partir un almacén
físico en dos bases de datos.

Si en el futuro la operación sí se separa (almacén propio, personal propio), la
respuesta correcta son **dos tenants en el mismo sistema**, no dos repositorios:
la multi-tenencia ya existe y desde esta remediación está aplicada en la base.

### D-2 · AMEX pasa a llamarse Dorado Prefer

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

### D-3 · Prioridad actual: rediseño visual

El trabajo funcional queda en pausa. La prioridad pasa a ser el rediseño visual
del software. Pendiente de recibir prototipo/referencias del dueño.

Restricciones que condicionan el diseño más que cualquier preferencia estética:
los KDS son pantallas de cocina (táctiles, a distancia, con las manos ocupadas) y
el QR es un móvil de pasajero.

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

### F-037 · La capa 2 nunca se materializa — RESUELTO (2026-08-24)

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

Pendientes:

1. Rotar `SUPABASE_SERVICE_ROLE_KEY` (urgente).
2. Rotar `SUPABASE_JWT_SECRET` cuando `ALLOW_LEGACY_HS256` quede apagado.
3. Monitor HTTP contra `/health` en Better Stack.

Hechas el 2026-08-22 por el dueño:

- ✅ CAPTCHA nativo de Supabase Auth activado. Obligó a cambiar el login: el
  token de Turnstile es de un solo uso, así que `iniciarSesion` dejó de
  validarlo contra Cloudflare y lo reenvía a Supabase en
  `options.captchaToken`. Sin ese cambio el login quedaba roto.
  **Verificar en el dashboard que el proveedor sea Cloudflare Turnstile y que
  el secreto sea el mismo `TURNSTILE_SECRET_KEY` del proyecto.**
- ✅ Registro público deshabilitado.
