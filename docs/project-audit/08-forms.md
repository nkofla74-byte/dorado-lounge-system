# 08 · Formularios

Todos los formularios de escritura validan con **Zod** en el cliente (react-hook-form +
`@hookform/resolvers`) **y otra vez en el servidor** dentro de la Server Action. La fuente de
verdad es `packages/shared-validation/src/index.ts` (382 líneas, 47 pruebas propias).

Ninguna Server Action de escritura confía en el input del cliente: todas hacen
`schema.safeParse(input)` antes de tocar la base. Verificado leyendo las 81 acciones.

---

## 1. Inventario

### Nuevo insumo · `CreateInsumoDialog` → `createInsumo`

| Campo          | Tipo   | Oblig. | Validación                                               |
| -------------- | ------ | ------ | -------------------------------------------------------- |
| `nombre`       | texto  | Sí     | 1–255 caracteres                                         |
| `codigo`       | texto  | No     | ≤ 50; si se omite lo genera `fn_siguiente_codigo_insumo` |
| `capa`         | select | Sí     | `capa_1` \| `capa_2`                                     |
| `unidadMedida` | select | Sí     | `g` \| `ml` \| `unidad`                                  |
| `stockMinimo`  | número | Sí     | ≥ 0 (por defecto 0)                                      |
| `mermaDefault` | número | Sí     | 0 ≤ x ≤ 0,9999 — coeficiente, no porcentaje              |

→ `INSERT insumos` (RLS `inventory:write`). Constraint `insumos_tenant_codigo_unique`.

### Editar insumo · `EditInsumoDialog` → `updateInsumo`

Campos `id` (uuid), `nombre`, `stockMinimo`, `mermaDefault`. No permite cambiar unidad ni
capa —correcto: cambiarlas invalidaría el histórico de movimientos.

### Nuevo lote · `LotesSheet` / `NuevoIngresoDialog` → `createLote`

| Campo              | Tipo   | Oblig. | Validación                  |
| ------------------ | ------ | ------ | --------------------------- |
| `insumoId`         | uuid   | Sí     |                             |
| `cantidadInicial`  | número | Sí     | > 0, máx. 4 decimales       |
| `fechaVencimiento` | fecha  | No     | ISO date                    |
| `proveedorId`      | uuid   | No     | FK a `proveedores`          |
| `proveedor`        | texto  | No     | ≤ 255 (texto libre, legado) |
| `costoUnitario`    | número | No     | > 0, máx. 2 decimales (COP) |
| `cantidadEmpaques` | entero | No     | > 0 — ⚠️ **regla cruzada**  |
| `pesoUnitario`     | número | No     | > 0 — ⚠️                    |
| `unidadPeso`       | select | No     | ⚠️                          |

**Regla cruzada (`.refine`)**: los tres campos de empaque deben venir **todos juntos o
ninguno**. Mensaje: _"cantidadEmpaques, pesoUnitario y unidadPeso deben venir juntos o
ninguno"_.

⭐ Al guardar se aplica la **merma de recepción**: la fila de `lotes` almacena la cantidad
**neta** y el coste unitario neto (`costo / (1 − coef)`), preservando el valor total del lote.

### Stock out · `StockOutDialog` → `stockOut`

`insumoId` (uuid), `cantidad` (> 0), `turnoId` (opcional), **`idempotencyKey` obligatoria**.
→ `fn_descontar_insumo_fefo`.

### Merma · `MermaDialog` → `registrarMerma`

`insumoId`, `cantidad` (> 0), `categoria` (`operativa` \| `vencimiento` \| `accidente` \|
`calidad` \| `otro`), `descripcion` (≤ 500), **`idempotencyKey` obligatoria**.
→ `fn_registrar_merma`, atómica.

### Importación masiva · `BulkImportDialog` → `createInsumosBulk`

Recibe filas sin tipar y devuelve `BulkImportResult` con el desglose de éxitos y fallos por
fila. Es el único formulario con tolerancia parcial a errores; el resto es todo o nada.

---

## 2. Recetas

### Nueva receta · `CreateRecipeDialog` → `createReceta`

**Unión discriminada por `tipoReceta`** — el mejor uso de Zod del repositorio.

**Rama `produccion`** (capa 1 → capa 2):

| Campo                 | Oblig. | Validación                              |
| --------------------- | ------ | --------------------------------------- |
| `nombre`              | Sí     | 1–255                                   |
| `insumoDestinoId`     | Sí     | uuid — el elaborado que produce         |
| `porciones`           | Sí     | entero > 0                              |
| `rendimientoCantidad` | Sí     | > 0, ≤ 1 000 000                        |
| `descripcion`         | No     | ≤ 500                                   |
| `ingredientes[]`      | No     | array de `recetaIngredienteInputSchema` |

`rendimientoCantidad` es obligatorio **y la base lo exige con el CHECK
`recetas_produccion_tiene_rendimiento`**: sin él no se puede crear el lote del elaborado al
completar la tanda (era el agujero de F-037).

**Rama `servicio`** (capa 1/2 → zona):

| Campo            | Oblig. | Validación                                                          |
| ---------------- | ------ | ------------------------------------------------------------------- |
| `nombre`         | Sí     | 1–255                                                               |
| `zona`           | Sí     | `amex` \| `snack` \| `buffet` — CHECK `recetas_servicio_tiene_zona` |
| `porciones`      | Sí     | entero > 0                                                          |
| `descripcion`    | No     | ≤ 500                                                               |
| `categoriaMenu`  | No     | `entrada` \| `plato_fuerte` \| `acompanante` \| `postre`            |
| `ingredientes[]` | No     |                                                                     |

### Añadir ingrediente · `IngredientsSheet` → `addIngredienteAReceta`

`recetaId`, `insumoId`, `cantidad` (> 0), `unidad?`, `mermaCoeficiente` (0–0,9999, por
defecto 0). Constraint `receta_ingredientes_unique` impide duplicar el mismo insumo.

### Metadatos de menú QR · `IngredientsSheet` → `updateRecetaMenuMeta`

`recetaId`, `categoriaMenu` (nullable), `descripcion` (nullable, ≤ 500), `imagenUrl` — URL
válida o cadena vacía, que se transforma a `null`. Buen detalle: el usuario puede borrar la
imagen dejando el campo en blanco.

---

## 3. Producción

### Nueva tanda · `CreateTandaDialog` → `createTanda`

`recetaId`, `turnoId?`, `cantidadTandas` (entero > 0), `zonaDestino`, `pedidoItemId?`,
`notas?` (≤ 500), **`idempotencyKey`**. Constraint `tandas_produccion_idempotency_key_key`.

---

## 4. Pedidos

### Nuevo pedido · `CreatePedidoZonaDialog` / carta AMEX → `createPedido`

| Campo              | Oblig. | Validación                                               |
| ------------------ | ------ | -------------------------------------------------------- |
| `zona`             | Sí     | `amex` \| `snack` \| `buffet`                            |
| `numeroMesa`       | No     | ≤ 20                                                     |
| `notas`            | No     | ≤ 500                                                    |
| `idempotencyKey`   | Sí     |                                                          |
| `items[]`          | Sí     | **mínimo 1** — _"Un pedido debe tener al menos un item"_ |
| `items[].recetaId` | Sí     | uuid                                                     |
| `items[].cantidad` | Sí     | entero > 0                                               |
| `items[].notas`    | No     | ≤ 255                                                    |

Además del esquema, el **ruteo por área** (`rutearPedido`) rechaza el pedido si algún plato
no tiene área asignada o si su área no sirve a esa zona (`ZONA_AREAS_PERMITIDAS`).

---

## 5. Turnos

### Abrir turno · `TurnoGuard` → `iniciarTurno`

| Campo       | Oblig. | Validación                                                                              |
| ----------- | ------ | --------------------------------------------------------------------------------------- |
| `bloque`    | Sí     | `6a2` \| `2a10` \| `10a6`                                                               |
| `teamlider` | **Sí** | 1–255 — _"El nombre del jefe de turno es obligatorio"_. `NOT NULL` en base, sin default |

---

## 6. Proveedores

`createProveedorSchema` / `updateProveedorSchema`: `nombre` (obligatorio), `contacto`,
`telefono`, `email`, `notas`, `activo`. CHECK `proveedores_nombre_check` en base.

---

## 7. Administración de usuarios

### Crear tenant · → `crearTenant`

| Campo    | Validación                                                            |
| -------- | --------------------------------------------------------------------- |
| `nombre` | 2–100                                                                 |
| `slug`   | 3–32, `^[a-z0-9-]+$` — _"Solo minúsculas, números y guiones"_. UNIQUE |

### Crear usuario · → `crearUsuario` / `crearPersonal`

| Campo      | Validación                  |
| ---------- | --------------------------- |
| `tenantId` | uuid                        |
| `nombre`   | 2–100                       |
| `email`    | formato email               |
| `role`     | enum de 11 roles asignables |
| `password` | **mínimo 8**, máximo 100    |

⚠️ **Observación de seguridad, no defecto**: 8 caracteres sin requisitos de composición es el
mínimo de Supabase, no una política. Para personal con acceso a inventario y costes conviene
subirlo. Registrado como DT-11 (prioridad baja).

Los claims (`role`, `tenant_id`) los provisiona `fn_provisionar_claims_usuario`
(`SECURITY DEFINER`), no la aplicación: es lo que cierra la escalada de privilegios por
metadata de signup (F-001, con prueba de RLS `f001_signup_no_escala_privilegios`).

---

## 8. Login · `app/(auth)/login/page.tsx` → `iniciarSesion`

| Campo            | Validación                                           |
| ---------------- | ---------------------------------------------------- |
| `email`          | requerido                                            |
| `password`       | requerido; toggle de visibilidad                     |
| `turnstileToken` | requerido si `TURNSTILE_SECRET_KEY` está configurado |

Cadena: rate limit `login` (5/15 min **por cuenta**) → Turnstile → `signInWithPassword` con
`options.captchaToken` → `getSafeNext(next, role)`, que rechaza redirecciones externas
(previene _open redirect_: solo acepta rutas internas que no empiecen por `//` ni por
`/login`). 11 pruebas en `login-actions.test.ts`.

---

## 9. Pedido por QR (pasajero) · `QrPassengerApp` → `createPedidoFromQR`

Sin sesión. La credencial es el **JWT de mesa** firmado con `JWT_PASSENGER_SECRET`.

Cadena de validación, en orden:

1. `verifyMesaToken(token)` — HS256; exige `tenantId`, `zona`, `mesaNumero`.
2. Rate limit `qrOrder` — 6 pedidos / 10 min por `tenant:mesa:ip`. **Fail-closed en producción.**
3. Turnstile, si hay `TURNSTILE_SECRET_KEY`.
4. `createPedidoSchema.safeParse(...)`.
5. ⭐ **Comprobación anti cross-tenant**: se consultan los `recetaId` contra
   `tenant_id = mesa.tenantId AND tipo_receta='servicio' AND activo AND categoria_menu IS NOT NULL`;
   si el número de recetas devueltas no coincide con el pedido, se rechaza.
6. `rutearPedido(...)` — rechaza platos sin área o cuya área no sirve a esa zona.
7. `fn_crear_pedido_qr` — alta atómica de pedido + ítems.
8. Colisión `23505` sobre `idempotency_key` → devuelve el pedido existente (reintento idempotente).

Si la red falla, el pedido se encola en IndexedDB con la **misma** `idempotencyKey`, de modo
que el reenvío es idempotente aunque el servidor ya lo hubiera recibido.

---

## 10. Esquemas huérfanos

Siete esquemas exportados **sin un solo consumidor** en todo el repositorio (ni siquiera en
sus propias pruebas):

`despacharLoteBuffetSchema` · `registrarTicketsTurnoSchema` · `enviarStuartSchema` ·
`solicitarPreparacionSchema` · `destinoPreparacionSchema` · `transicionTandaSchema` ·
`transicionPedidoSchema` · `paginationSchema`

Son restos de funcionalidades retiradas en el refoco operacional de 2026-05/06 (tickets de
turno, envío a stuart, solicitudes de preparación, despacho de lote a buffet). Registrado
como **DT-02**.
