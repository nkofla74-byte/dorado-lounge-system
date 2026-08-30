# 14 · Testing

> Toda esta sección se basa en **ejecución real** de las suites, no en la lectura de sus
> nombres.

## 1. Qué se ejecutó y qué salió

```
$ pnpm test
packages/shared-types       →  3 ficheros ·  44 pruebas ✅
packages/shared-validation  →  2 ficheros ·  47 pruebas ✅
apps/socket-server          →  1 fichero  ·  24 pruebas ✅
apps/web                    → 50 ficheros · 452 pruebas ✅
────────────────────────────────────────────────────────
TOTAL                       → 56 ficheros · 567 pruebas ✅  (exit 0)

$ ./scripts/sql-harness/run-tests.sh
80 migraciones aplicadas sobre PostgreSQL 16 limpio
RLS/RPC: 12 pasaron, 0 fallaron ✅

$ pnpm --filter @dorado/web exec vitest run --coverage
All files → 91,53 % statements · 94,18 % branches · 96 % functions ✅
```

**Ninguna prueba falla, ninguna está marcada como `skip` u `only`.** El estado del repositorio
en este aspecto es honesto.

> Nota de deriva: `docs/remediacion/REMEDIATION_TRACKER.md` declara 507 pruebas y 11 suites de
> RLS. Las cifras reales medidas hoy son **567 y 12**. El trabajo creció después de escribir
> el tracker; la documentación se quedó atrás por debajo, no por encima.

---

## 2. Pruebas unitarias e integración (Vitest)

### `apps/web` — 50 ficheros, 452 pruebas

| Área          | Ficheros | Ejemplos destacados                                                                                                                             |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventario    | 4        | `merma.test.ts` (**35 pruebas** — el algoritmo del Principio Rector), `fefo-concurrency`, `lote-vencimiento`                                    |
| Pedidos       | 11       | `optimistic-locking`, `idempotency`, `tenant-isolation`, `routing`, `pedido-transitions`, `actions-entregar-pedido`, `actions-item-transitions` |
| Autorización  | 6        | `assertCan` (11), `rbac-sql` (5 — detecta deriva entre TS y SQL), `permissions`, `role-home` (15), `rutas-publicas`, `login-throttle`           |
| Alertas       | 4        | `check-deduplication` (10), `canales-alerta` (5)                                                                                                |
| Requisiciones | 3        | dominio, aplicación y acciones                                                                                                                  |
| Turnos        | 2        | dominio (16) y aplicación                                                                                                                       |
| Producción    | 3        | transiciones de tanda, creación                                                                                                                 |
| Superuser     | 2        | dominio (22), provisión de claims (7)                                                                                                           |
| Proveedores   | 2        | dominio (13), aplicación                                                                                                                        |
| Diseño        | 2        | `contraste` (29), `hig-contract` (11)                                                                                                           |
| Seguridad     | 2        | `csp` (9), `middleware-matcher` (2)                                                                                                             |
| QR / Login    | 2        | `qr-actions` (8), `login-actions` (11)                                                                                                          |
| Utilidades    | 3        | `units` (10), `turnos` (13), `turnstile/verify` (2)                                                                                             |

### Piezas de infraestructura de prueba bien hechas

- **`in-memory-order-repository.ts`** — doble en memoria que implementa el port real. Permite
  probar los casos de uso sin base de datos, cumpliendo la arquitectura hexagonal en las
  propias pruebas.
- **`rbac-sql.test.ts`** — compara la matriz de `permissions.ts` con el bloque generado del
  SQL. **Falla si alguien cambia una sin regenerar la otra.** Es el guardián de la
  consistencia entre las dos capas de autorización.
- **`tenant-isolation.test.ts`** — comprueba que un tenant no ve datos de otro.

---

## 3. Arnés de RLS/RPC contra PostgreSQL real

`scripts/sql-harness/` es la pieza más valiosa del aparato de pruebas de este repositorio, y
es poco habitual encontrarla.

| Fichero                | Papel                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_supabase_shim.sql` | Reproduce lo que Supabase da de fábrica: schema `auth`, `auth.jwt()`, roles `anon`/`authenticated`/`service_role`, stubs de `pg_cron`, `pg_net` y `vault`              |
| `10_seed.sql`          | Fixture determinista: 2 tenants, 9 usuarios cubriendo los roles, insumos de ambas capas, lotes, recetas y un turno activo                                              |
| `20_test_helpers.sql`  | `test.login(uuid)` fija `request.jwt.claims` y `SET LOCAL ROLE authenticated`, **igual que hace PostgREST**. Más `test.assert`, `test.exec_count`, `test.expect_error` |
| `apply.sh`             | Recrea la base y aplica las 80 migraciones en orden                                                                                                                    |
| `run-tests.sh`         | Cada prueba en su propia transacción, que revierte al terminar                                                                                                         |

`test.exec_count` devuelve las filas afectadas o `-1` si el motor denegó por privilegio: eso
permite distinguir _«denegado por GRANT»_ de _«invisible por RLS»_, que son cosas distintas.
Es un detalle que revela que quien lo escribió entendía el problema.

### Las 12 suites, todas verdes

```
✓ f001_signup_no_escala_privilegios      ✓ f009_transicion_item_atomica
✓ f002_principio_rector                  ✓ f021_costos_por_lote
✓ f002_sin_borrado_duro                  ✓ f022_merma_atomica
✓ f004_turno_en_ledger                   ✓ f036_insert_exige_permiso
✓ f005_analytics_refrescable             ✓ f037_capa2_se_materializa
✓ f006_roles_produccion_pueden_escribir
✓ f008_entrega_atomica
```

Regla del repositorio, documentada en el README del arnés: _«Cada defecto corregido deja una
prueba que falla si vuelve. Escríbela en rojo antes del arreglo.»_

---

## 4. Pruebas E2E (Playwright) — 🟡 no ejecutables aquí

**9 ficheros de especificación + 1 de setup, 31 pruebas.** Su código se leyó; **no se
ejecutaron** porque exigen un entorno de staging con Supabase real y usuarios sembrados
(`E2E_ADMIN_EMAIL`, `E2E_CHEF_EMAIL`, etc.), que no existe en este contenedor.

| Fichero                    | Pruebas | Cubre                                                                           |
| -------------------------- | ------- | ------------------------------------------------------------------------------- |
| `auth.setup.ts`            | —       | Genera `storageState` para admin y cocina caliente                              |
| `auth.spec.ts`             | 6       | Credenciales inválidas, redirección sin sesión, guardia de rutas, home por rol  |
| `pedido-lifecycle.spec.ts` | 8       | Ciclo completo del pedido, cancelación                                          |
| `inventario.spec.ts`       | 4       | Tabla de insumos, diálogos de alta y stock out                                  |
| `kds.spec.ts`              | 3       | Tres columnas del tablero, refresco, flujo de estados                           |
| `turnos.spec.ts`           | 3       | Panel, apertura de turno                                                        |
| `zonas.spec.ts`            | 2       | Snack y buffet                                                                  |
| `requisiciones.spec.ts`    | 2       | Cola del almacén, petición desde cocina                                         |
| `recetas.spec.ts`          | 2       | Lista de recetas, KDS                                                           |
| `flujo-amex.spec.ts`       | 1       | **El más valioso**: crear → despachar → entregar, comprobando el descuento FEFO |

La configuración es correcta: `fullyParallel: false` porque comparten estado de base;
`storageState` por rol; en CI arranca `next start` y espera con un bucle de `curl`.

**Riesgo:** son la única cobertura funcional de los 78 componentes React, y solo corren en CI
con un staging vivo. Si ese entorno se degrada, la cobertura de UI cae a cero sin que nadie
lo note.

---

## 5. Cobertura — la cifra y la letra pequeña

**91,53 % suena excelente. Hay que entender sobre qué se mide.**

`apps/web/vitest.config.ts` limita el alcance con un `include` explícito:

```
src/modules/*/domain/**      src/lib/auth/**      src/lib/audit.ts
src/modules/*/application/** src/lib/security/**  src/lib/result.ts
                                                  src/lib/turnos.ts · units.ts
```

Medido sobre el código real:

| Ámbito                                                                               |     Líneas | ¿Bajo umbral de cobertura?                                      |
| ------------------------------------------------------------------------------------ | ---------: | --------------------------------------------------------------- |
| Alcance incluido (`domain`, `application`, `lib/auth`, `lib/security`, 4 utilidades) |  **2 279** | ✅ sí — 91,53 %                                                 |
| `modules/*/actions.ts`                                                               |      2 856 | ❌ no (aunque **sí tienen pruebas**, no cuentan para el umbral) |
| `modules/*/infrastructure/`                                                          |      2 854 | ❌ no                                                           |
| `components/`                                                                        |     15 297 | ❌ no                                                           |
| `app/`                                                                               |      2 514 | ❌ no                                                           |
| **Total producción en `apps/web/src`**                                               | **26 644** | **≈ 8,5 % bajo umbral**                                         |

Esto **no** significa que el 91,5 % sea falso: significa que se aplica al núcleo lógico, que
es donde más importa. El alcance ya se amplió una vez al cerrar F-023 (antes era solo
`domain/**`). Pero conviene decirlo con precisión:

> **El 91,53 % cubre el corazón algorítmico del sistema, que es el 8,5 % de sus líneas.
> Los 15 297 renglones de componentes React no tienen ninguna prueba funcional.**

Umbral especial acertado: `merma.ts` exige **90 %** porque es el algoritmo del Principio
Rector.

---

## 6. Qué NO está probado

| Zona                                 | Riesgo                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **78 componentes React**             | 🔴 Ninguna prueba de renderizado ni interacción. Solo 2 ficheros de contrato de diseño.                                              |
| **Lectura de la vista de analítica** | 🔴 **Es exactamente el hueco por el que pasó el hallazgo H-A.** `f005` prueba que la vista se _refresca_, nunca que se pueda _leer_. |
| **Cableado de canales de socket**    | 🔴 No hay prueba de que un componente que escucha un evento se una al canal correcto. Es el hueco de H-C y H-E.                      |
| `modules/*/infrastructure/`          | 🟡 Los adaptadores Supabase no tienen prueba directa (los cubre el arnés SQL de forma indirecta)                                     |
| Cola offline (IndexedDB)             | 🟡 `queue.ts`, `sync.ts`, `use-offline-sync.ts` sin pruebas                                                                          |
| `lib/audit.ts`                       | 🟡 0 % de cobertura pese a estar en el alcance                                                                                       |
| Emisión de eventos (`emit-event.ts`) | 🟡 Sin prueba propia                                                                                                                 |

---

## 7. Lección: los defectos viven donde no hay pruebas

Los cinco hallazgos de esta auditoría caen, **sin excepción**, en las zonas de la tabla
anterior:

| Hallazgo                                    | Zona sin cobertura                               |
| ------------------------------------------- | ------------------------------------------------ |
| H-A · analítica `permission denied`         | Lectura de la vista (solo se prueba el refresco) |
| H-B · analítica de superuser vacía          | Idem                                             |
| H-C · la campana no se une a ningún canal   | Cableado de socket en componentes                |
| H-D · sin refresco programado de la MV      | Configuración de `pg_cron`                       |
| H-E · el QR no despierta AMEX ni pastelería | Cableado de socket en acciones                   |

No es casualidad. Es la mejor prueba de que el aparato de testing de este repositorio
**funciona donde llega** — y de dónde hay que extenderlo.

---

## 8. Estado de la calidad de las pruebas

| Criterio                                  | Valoración                                               |
| ----------------------------------------- | -------------------------------------------------------- |
| ¿Se ejecutan de verdad?                   | ✅ Sí, verificado                                        |
| ¿Hay pruebas _skip_ u _only_?             | ✅ Ninguna                                               |
| ¿Prueban comportamiento o implementación? | ✅ Comportamiento, con dobles en memoria sobre los ports |
| ¿Cubren regresiones concretas?            | ✅ Nomenclatura `fNNN_` por hallazgo                     |
| ¿Se prueba la base de datos de verdad?    | ✅ **Sí — es lo más destacable del repositorio**         |
| ¿Se prueba la interfaz?                   | ❌ Solo E2E, y solo con staging vivo                     |
| ¿La cifra de cobertura se entiende bien?  | ⚠️ Solo si se lee el `include` del config                |
