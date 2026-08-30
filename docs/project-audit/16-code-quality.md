# 16 · Calidad de código

## 1. Señales objetivas

| Indicador                                   | Valor medido                                                          | Lectura |
| ------------------------------------------- | --------------------------------------------------------------------- | ------- |
| `pnpm lint`                                 | **0 avisos, 0 errores**                                               | 🟢      |
| `pnpm typecheck` (TS strict, 5 proyectos)   | **0 errores**                                                         | 🟢      |
| `TODO` / `FIXME` / `HACK` / `XXX` reales    | **0**                                                                 | 🟢      |
| `@ts-ignore` / `@ts-expect-error` en fuente | **0** (solo en `.next/` generado)                                     | 🟢      |
| `eslint-disable` en fuente                  | 6, todas justificadas (5 de `no-img-element`, 1 de `exhaustive-deps`) | 🟢      |
| `console.log`                               | **0** (hay `logger` estructurado)                                     | 🟢      |
| `: any` / `as any`                          | 9 en ~26 600 líneas (0,03 %)                                          | 🟢      |
| `select('*')`                               | 4                                                                     | 🟢      |
| Formato (`prettier --check`)                | Gate de CI                                                            | 🟢      |
| Conventional Commits                        | Enforzado por commitlint                                              | 🟢      |
| Hook pre-commit                             | prettier + typecheck                                                  | 🟢      |

Cero `TODO` en 35 000 líneas es inusual y refleja una disciplina real: lo pendiente se
registra en `docs/remediacion/`, no en comentarios que nadie relee.

---

## 2. Arquitectura del código

### Lo que está bien

**La dirección de dependencias hexagonal se enforza con ESLint**, no con buena voluntad.
`packages/eslint-config/index.js` impide que `domain/` importe `@supabase/*`. Es la diferencia
entre una arquitectura documentada y una arquitectura viva.

**El tipo `Result<T>` está aplicado de verdad.** Las 81 Server Actions devuelven
`{ok: true, value} | {ok: false, error}`. No hay `try/catch` ad hoc esparcido por el dominio.

**Los comentarios explican el _porqué_, no el _qué_.** Ejemplo real de `middleware.ts`:

> _"Los ficheros de `public/` se excluyen por extensión. El navegador pide el manifest y el
> service worker SIN cookies —es su comportamiento por defecto—, así que al pasar por aquí se
> veían como anónimos y acababan en /login: el navegador recibía HTML donde esperaba JSON o
> JavaScript."_

Ese comentario ahorra media hora de depuración a quien llegue después. El repositorio está
lleno de ellos, y casi todos citan el hallazgo (`F-0NN`) que motivó el cambio.

### Lo que se puede mejorar

| #   | Problema                                   | Ubicación                                                                                   | Impacto                                                                                                        |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | **Componente de 1 389 líneas**             | `qr-passenger-app.tsx`                                                                      | Mantenibilidad. Contiene carta, carrito, envío, cola offline y estados de error en un solo fichero.            |
| 2   | **Server Actions de 944 líneas**           | `modules/orders/actions.ts`                                                                 | 17 acciones en un fichero. La estructura hexagonal invita a dividirlo por caso de uso.                         |
| 3   | **Fuente de verdad duplicada**             | `sidebar.tsx` `NAV_ITEMS` vs `role-home.ts` `ROLE_ALLOWED_PREFIXES`                         | El propio comentario dice "mantener sincronizado". Sin prueba que detecte la deriva.                           |
| 4   | **Textos multiidioma hardcodeados**        | `components/qr/offline-banner.tsx`                                                          | Objeto `TEXTS` con 4 idiomas a mano, pese a existir `fr.json` y `pt.json`. Incumple la regla 7 de `CLAUDE.md`. |
| 5   | **`any` en el repositorio de analítica**   | `analytics-repository.ts` (`let query: any`)                                                | Pierde el tipado justo en el módulo que está roto.                                                             |
| 6   | Cinco componentes por encima de 400 líneas | `carta-amex`, `create-recipe-dialog`, `pedido-table`, `ingredients-sheet`, `kds-board-amex` | Moderado                                                                                                       |

---

## 3. Código muerto — inventario completo

| Elemento                                                           | Tipo                               | Dónde                               |
| ------------------------------------------------------------------ | ---------------------------------- | ----------------------------------- |
| `getSolicitudesCocina()` → `ok([])` incondicional                  | Función viva sin datos             | `modules/production/actions.ts:263` |
| `SolicitudesPanel`                                                 | Componente que nunca mostrará nada | `components/production/`            |
| Evento `SOLICITUD_PREPARACION`                                     | Consumidor sin emisor              | `socket-events.ts`                  |
| Eventos `STOCK_OUT` y `DESPACHO`                                   | Sin emisor **ni** consumidor       | `socket-events.ts`                  |
| Canales `sala:cocina:fria` y `sala:cocina:caliente`                | Declarados, nadie se une           | `socket-events.ts`                  |
| Canal `sala:broadcast:cocina`                                      | Nadie emite                        | `socket-events.ts`                  |
| 8 esquemas Zod                                                     | Sin ningún consumidor              | `shared-validation/src/index.ts`    |
| `mv_cogs_per_passenger`                                            | Referenciada tras ser eliminada    | `refresh_analytics_views`           |
| ENUM `tipo_acceso_sala`                                            | Sin tabla que lo use               | PostgreSQL                          |
| Valores inertes en `user_role`, `unidad_medida`, `area_produccion` | Inevitables (Postgres)             | PostgreSQL                          |

Todo procede del **refoco operacional de mayo-junio de 2026**, cuando se retiraron vuelos,
afluencia, chat y tickets. La limpieza del SQL se hizo (hay migraciones `remove_*` explícitas);
la del TypeScript quedó a medias.

---

## 4. Rendimiento

### Lo que se resolvió bien

- **N+1 de costos eliminado** (F-021): `fn_costo_recetas(tenant, uuid[])` calcula en lote.
  Prueba de RLS `f021_costos_por_lote` lo protege.
- **Broadcast multicanal en paralelo**: `emitEventoMulticanal` usa `Promise.allSettled` en vez
  de encadenar `await`.
- **Timeout de 1 500 ms en `emitEvent`** (F-015): un socket-server lento ya no cuelga la
  Server Action que lo espera.
- **Checks de cron por lotes de 5** con `allSettled`.
- **Carga perezosa en trazabilidad**: `ExpandedRow` pide `getTrazaPedido(id)` solo al
  desplegar la fila.
- **109 índices, 20 de ellos parciales**, dirigidos a las consultas calientes (cola FEFO, cola
  del almacén, filtro por área del KDS, alertas no leídas).

### Lo que preocupa

| #   | Problema                                                                                                                                                                                        | Impacto                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | **`assertSesionVigente()` hace una consulta extra a `users` en cada una de las 81 acciones.** No hay caché ni TTL. En una sala 24/7 con 4 KDS refrescando, es tráfico constante contra la base. | 🟠 Alto en escala           |
| 2   | **226 kB de JS compartido**; `/inventario` llega a 363 kB y `/almacen` a 349 kB. Son las pantallas que se operan sobre tabletas en la red del aeropuerto.                                       | 🟠 Alto para el caso de uso |
| 3   | **Cronómetros a 1 Hz**: `PedidoCard` y `AmexCard` ejecutan `setInterval` cada segundo por tarjeta. Con 20 pedidos en pantalla son 20 re-renders por segundo.                                    | 🟡 Medio                    |
| 4   | **Sin refresco programado de la vista materializada** — no es rendimiento, es corrección (H-D).                                                                                                 | 🔴                          |
| 5   | Middleware de 155 kB: se ejecuta en cada petición no estática.                                                                                                                                  | 🟡 Medio                    |

Ninguno está medido en producción; son riesgos deducidos del código y del `build`.

---

## 5. Mantenibilidad

| Criterio                   | Valoración                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Modularidad                | 🟢 13 módulos hexagonales con límites reales y enforzados                                                                      |
| Reutilización              | 🟢 `ZonaView` sirve snack y buffet; `KdsBoardArea` sirve tres áreas; `transicionar()` centraliza 4 transiciones de requisición |
| Consistencia               | 🟢 Todas las acciones siguen el mismo patrón sin excepción                                                                     |
| Nomenclatura               | 🟢 Código en inglés, dominio en español — decidido y respetado                                                                 |
| Documentación en el código | 🟢 Excelente; los comentarios citan el hallazgo que motivó cada cambio                                                         |
| Documentación externa      | 🟡 Muy extensa, pero con deriva (ver `23-evidence-index.md`)                                                                   |
| Testing                    | 🟡 Núcleo bien cubierto; UI sin cobertura                                                                                      |
| Onboarding                 | 🟢 `ESTADO-Y-PROXIMOS-PASOS.md` es un punto de retomada real y verificable                                                     |

**Detalle notable:** ese documento de retomada incluye consultas SQL para que quien llegue
compruebe por sí mismo el estado de producción _"sin depender de lo que diga nadie"_.
Esta auditoría las ejecutó sobre la base reconstruida y **las cuatro dan el resultado
declarado** (80 migraciones, 144 filas de RBAC, `pedidos` solo con `SELECT`, 0 políticas
`FOR ALL`).

---

## 6. Diseño e interfaz

`.claude/skills/` incorpora 10 skills de diseño con `dorado-design-system` como autoridad.
Dos reglas propias del proyecto, verificables en el código:

- **Objetivo táctil de 56 px** en KDS y almacén (no los 44 pt del HIG de Apple), porque se
  opera con guantes. `button.tsx` fija un suelo de 44 px en todas las variantes con el
  comentario _"es de seguridad, no de estética"_.
- **SF Symbols no se puede embeber en web** (fuente con licencia de Apple); se usa
  `lucide-react`.

Hay pruebas automáticas de diseño, algo poco común:

- `contraste.test.ts` — **29 pruebas** de ratio de contraste de los tokens en tema claro y
  oscuro. Los commits `66b0f00` y `71e3bd6` corrigen incumplimientos **medidos**, no
  percibidos.
- `hig-contract.test.ts` — 11 pruebas del contrato de objetivos táctiles.

Refactorización reciente de calidad: tres barras de pestañas escritas a mano se unificaron en
`ui/tab-bar.tsx` con contrato ARIA completo (`20b2ae7`, `008a50b`, `503734b`).

---

## 7. Internacionalización

| Locale |  Claves | Alcance                 |
| ------ | ------: | ----------------------- |
| `es`   | **989** | Dashboard completo + QR |
| `en`   | **989** | Dashboard completo + QR |
| `fr`   |      26 | Solo namespace `qr`     |
| `pt`   |      26 | Solo namespace `qr`     |

**Paridad exacta es↔en verificada programáticamente: 0 claves faltantes, 0 sobrantes.**
Coincide con lo documentado (dashboards es/en; QR es/en/fr/pt).

Única desviación: el `OfflineBanner` del QR trae sus textos hardcodeados en los cuatro
idiomas en lugar de usar next-intl.

---

## 8. Resumen

**Calidad alta, con dos zonas de sombra bien delimitadas.**

Lo que está bajo control automático (tipos, lint, formato, dominio, RLS) está impecable. Lo
que no lo está (el cableado de sockets, la lectura de la analítica, el renderizado de
componentes) es exactamente donde aparecen los defectos. El repositorio no tiene un problema
de rigor; tiene un problema de **alcance de la red de seguridad**.
