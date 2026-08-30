# 19 · Funcionalidades pendientes

Solo se lista lo que **no existe en el código**. Lo que existe a medias está en
[`18-partial-features.md`](./18-partial-features.md).

La clasificación responde a: _¿qué impide que el sistema funcione, qué impide entregarlo, y
qué lo mejoraría?_

---

## 🔴 Prioridad crítica — sin esto el sistema no cumple lo que promete

### C-1 · Corregir la lectura de la vista de analítica

`/analytics` es una de las 21 pantallas del producto y hoy devuelve un error de permisos.
No es "pendiente": es una funcionalidad entregada que no funciona. Ver P-1.
**Esfuerzo: mínimo** (una migración de una línea + una prueba).

### C-2 · Camino de analítica del superuser

El God Mode cross-tenant devuelve siempre vacío. Ver P-1.
**Esfuerzo: bajo.**

### C-3 · Refresco programado de la vista materializada

Sin un `cron.schedule`, la analítica muestra datos congelados desde el último refresco manual.
**Esfuerzo: mínimo** (una migración).

### C-4 · Unión a canales en `AlertasBell`

Las alertas de stock mínimo, vencimiento y demora AMEX son un requisito explícito de
`CLAUDE.md` y hoy no llegan en tiempo real a nadie. En una sala 24/7 con producto perecedero,
enterarse del vencimiento al recargar la página no es equivalente.
**Esfuerzo: bajo.**

### C-5 · Canales del alta de pedidos por QR

Un pedido de postre por QR no despierta la pantalla de pastelería. Ver P-3.
**Esfuerzo: mínimo** (reutilizar la lógica ya existente en `createPedido`).

---

## 🟠 Prioridad alta — necesarias para entregar el producto

### A-1 · Cerrar los huecos del disparador de stock mínimo

Los cinco tipos de alerta documentados **sí tienen check implementado**. Dos de ellos son por
evento, no por cron:

| Check                                                                               | Cómo se dispara                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `checkStockMinimo`                                                                  | _Fire-and-forget_ al final de `stockOut` (`inventory/actions.ts:240`) |
| `checkCambioPrecio`                                                                 | _Fire-and-forget_ al final de `createLote` (`:373`)                   |
| `runCheckVencimientos` · `runCheckDemoraAmex` · `runCheckRequisicionesSinDespachar` | cron cada 5 min                                                       |

El hueco real es **de cobertura de caminos**: `checkStockMinimo` solo se invoca desde
`stockOut`. **No se invoca cuando el stock baja por las otras tres vías**, que son las
habituales en operación:

- `entregarPedido` → `fn_entregar_pedido`, que descuenta por FEFO **dentro de Postgres** y por
  tanto no puede llamar a una función de TypeScript. **Es el camino por el que se consume la
  mayor parte del inventario.**
- `registrarMerma` — verificado: no llama al check.
- `fn_completar_tanda`, que consume ingredientes de capa 1.

**Consecuencia:** un insumo puede caer por debajo de su mínimo durante un servicio normal sin
que se genere ninguna alerta. El disparador nº 1 de `CLAUDE.md §Alertas` solo cubre la salida
manual de stock.

**Trabajo:** añadir un `runCheckStockMinimo(tenantId)` de barrido al cron de 5 minutos, que
recorra los insumos del tenant y compare stock contra mínimo. Es la solución robusta: no
depende de que cada camino de escritura se acuerde de invocar el check.

### A-2 · Persistencia del check de cambio de precio ante fallo

`checkCambioPrecio` está implementado y bien parametrizado
(`CAMBIO_PRECIO_UMBRAL_NOTIFICAR = 0.1`, `CAMBIO_PRECIO_UMBRAL_CRITICO = 0.25`), pero se
invoca con `void` (_fire-and-forget_): si falla, nadie se entera y la alerta se pierde sin
rastro. Mismo patrón en `checkStockMinimo`. Conviene registrar el fallo o reintentarlo desde
el barrido de A-1.

### A-3 · Editar y eliminar recetas

Hoy una receta creada con un error solo puede corregirse por SQL. Ver P-7.

### A-4 · Ajuste y conteo físico de inventario

Sin esto, la diferencia entre el stock teórico y el real no puede corregirse desde la
aplicación. En una operación de alimentos es imprescindible. Ver P-8.

### A-5 · Filtros de analítica por nodo y responsable

`CLAUDE.md` los declara obligatorios; la vista materializada no tiene esas dimensiones.
Requiere rehacer la vista, no solo la UI.

### A-6 · Completar la supresión de datos personales

Ver P-6. Requisito legal en Colombia (Habeas Data, Ley 1581).

### A-7 · Subida de imágenes

La carta QR y la carta AMEX muestran fotos, y hoy la URL se pega a mano. Ver P-9.

### A-8 · Prueba de RLS que lea la vista de analítica

No es una funcionalidad de usuario, pero es lo que impide que C-1 vuelva a ocurrir. La regla
del propio repositorio lo exige: _"cada defecto corregido deja una prueba que falla si vuelve"_.

---

## 🟡 Prioridad media — mejoras importantes

### M-1 · Cola offline para operaciones del personal

La infraestructura de idempotencia ya está en base. Falta generalizar la cola. Ver P-4.
En una sala de aeropuerto con conectividad irregular, es una mejora operativa real.

### M-2 · Decidir el destino de las "solicitudes de preparación"

Implementarlas de verdad o retirar el panel, el evento, el canal y el esquema. Ver P-5.

### M-3 · Consumidores para `TURNO_EVENTO` y `PEDIDO_COCINERO`

Se emiten y nadie los escucha. O se conecta un panel de administración en vivo al canal
`sala:admin`, o se retiran.

### M-4 · Retirar los eventos `STOCK_OUT` y `DESPACHO`

Están en el contrato de tipos sin emisor ni consumidor. Confunden a quien lea
`socket-events.ts` creyendo que describe el sistema real.

### M-5 · Historial de precios por insumo

Prerrequisito natural de A-2 y de un análisis de coste serio. Hoy solo existe el coste del
lote actual.

### M-6 · Exportación de reportes

`common.export` existe como clave de traducción; no hay ninguna acción de exportación (CSV,
Excel o PDF) en el repositorio. Para un admin que debe reportar a GISAT, es una carencia
previsible.

### M-7 · Panel de monitor KDS para admin

`CLAUDE.md` menciona "KDS monitor" entre las capacidades del admin. El admin puede entrar a
cada KDS por separado (su whitelist lo permite), pero **no existe una vista combinada**.
La ruta `/cocina` que la documentación asigna al rol `chef` no existe.

### M-8 · Reducir el peso del bundle en las pantallas de sala

363 kB en `/inventario` sobre tabletas y red de aeropuerto. Ver `16-code-quality.md §4`.

### M-9 · Cachear `assertSesionVigente`

Una consulta extra a `users` por cada una de las 81 acciones, sin TTL. Ver `16-code-quality.md §4`.

---

## ⚪ Prioridad baja — mejoras futuras

| ID   | Funcionalidad                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------- |
| B-1  | Pruebas de renderizado de componentes (Testing Library) — 15 297 líneas hoy sin cobertura funcional  |
| B-2  | Migrar `next lint` a la CLI de ESLint (obligatorio antes de Next 16)                                 |
| B-3  | Añadir script `lint` a `packages/shared-types` y `shared-validation`                                 |
| B-4  | Completar `fr` y `pt` más allá del namespace `qr`                                                    |
| B-5  | Usar next-intl en `components/qr/offline-banner.tsx` en vez del objeto `TEXTS`                       |
| B-6  | Política de contraseñas más fuerte que 8 caracteres                                                  |
| B-7  | Limpiar el ENUM `tipo_acceso_sala` y los 8 esquemas Zod huérfanos                                    |
| B-8  | Quitar `mv_cogs_per_passenger` de `refresh_analytics_views`                                          |
| B-9  | Notificaciones push del navegador (hoy `CLAUDE.md` dice explícitamente "solo notificaciones in-app") |
| B-10 | Dividir `qr-passenger-app.tsx` (1 389 L) y `orders/actions.ts` (944 L)                               |
| B-11 | Derivar `NAV_ITEMS` de `ROLE_ALLOWED_PREFIXES`, o añadir prueba de coherencia                        |
| B-12 | Añadir `import 'server-only'` a `lib/supabase/admin.ts`                                              |
| B-13 | Restringir el `UPDATE` de `alertas` a la columna `leida`                                             |

---

## Lo que **no** está pendiente porque es una decisión, no un olvido

| Elemento                                     | Por qué no cuenta como pendiente                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ruta `/cocina` y rol `chef`                  | Retirados deliberadamente en el refoco operacional. Falta actualizar `CLAUDE.md`, no reimplementarlos. |
| Vuelos, afluencia y recepción de pasajeros   | Retirados con migraciones explícitas (`remove_vuelos_afluencia_*`)                                     |
| Chat interno                                 | Retirado (`20260609000004_remove_chat.sql`)                                                            |
| Feature flags                                | Retirados (`20260613180000_remove_feature_flags.sql`)                                                  |
| Lecturas RLS sin filtro de permiso           | Decisión consciente documentada en ADR-004                                                             |
| F-026 (dos máquinas de estado sobre pedidos) | Abierto por requerir decisión de producto, no técnica (ADR-005)                                        |
| Notificaciones fuera de la app               | `CLAUDE.md` lo acota: "Solo notificaciones in-app"                                                     |
