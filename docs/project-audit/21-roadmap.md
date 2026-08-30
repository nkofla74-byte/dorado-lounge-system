# 21 · Roadmap

Construido **exclusivamente** a partir de lo encontrado en el código. Cada tarea lleva
descripción, dependencia, prioridad, complejidad relativa y criterio de aceptación.

> **No se estiman tiempos de desarrollo.** No hay evidencia en el repositorio sobre velocidad
> del equipo, disponibilidad ni proceso de despliegue que permita convertir complejidad en
> horas. La complejidad se expresa en escala relativa: **XS · S · M · L · XL**.

---

## Fase 1 — Correcciones críticas

Objetivo: que ninguna pantalla entregada devuelva un error.

| #   | Tarea                                                                                     | Dep. | Prio | Compl. | Criterio de aceptación                                                                                        |
| --- | ----------------------------------------------------------------------------------------- | ---- | ---- | ------ | ------------------------------------------------------------------------------------------------------------- |
| 1.1 | Migración que recree `v_consumo_vs_produccion_turno_tenant` **sin** `security_invoker`    | —    | 🔴   | **XS** | Un usuario `authenticated` con rol `admin` lee la vista y obtiene filas de su tenant, sin `permission denied` |
| 1.2 | Prueba de RLS `fXXX_analytics_legible.sql` que **lea** la vista como `authenticated`      | 1.1  | 🔴   | **XS** | La prueba falla contra el esquema actual y pasa tras 1.1                                                      |
| 1.3 | Corregir el camino de superuser: consultar la MV directamente o pasar el tenant explícito | 1.1  | 🔴   | **S**  | Con datos en la MV, un `superuser` ve filas de todos los tenants                                              |
| 1.4 | `cron.schedule('refresh-analytics', '*/15 * * * *', …)`                                   | 1.1  | 🟠   | **XS** | `SELECT * FROM cron.job` muestra el job; la MV se actualiza sin intervención                                  |
| 1.5 | `AlertasBell` se une a los canales de su rol y hace `leave` al desmontar                  | —    | 🟠   | **S**  | Generada una alerta, la campana incrementa su contador sin recargar la página                                 |
| 1.6 | Extraer la lógica de canales de `createPedido` y usarla también en el alta por QR         | —    | 🟠   | **S**  | Un pedido QR con un postre aparece en el KDS de pastelería sin recargar                                       |
| 1.7 | `runCheckStockMinimo(tenantId)` de barrido en el cron de 5 min                            | —    | 🟠   | **S**  | Bajar un insumo por debajo del mínimo mediante `entregarPedido` genera alerta en el siguiente ciclo           |

**Salida de fase:** las 21 pantallas cargan sin error; las alertas llegan en vivo; los cuatro
KDS reciben los pedidos de los tres orígenes.

---

## Fase 2 — Completar lo que ya está a medias

| #   | Tarea                                                                                                       | Dep. | Prio | Compl.                                | Criterio de aceptación                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------- | ---- | ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 2.1 | Decidir el destino de "solicitudes de preparación": implementarlas o retirar panel, evento, canal y esquema | —    | 🟡   | **S** (retirar) / **L** (implementar) | O bien `/pasteleria` deja de mostrar un panel vacío, o el panel muestra solicitudes reales               |
| 2.2 | Acciones `updateReceta`, `removeIngrediente`, `deleteReceta` + UI                                           | —    | 🟠   | **M**                                 | Un admin corrige el nombre y el rendimiento de una receta desde la interfaz; puede quitar un ingrediente |
| 2.3 | Completar la supresión de datos personales en `public.users`                                                | —    | 🟠   | **S**                                 | Tras `/api/gdpr/forget`, `users.nombre` queda anonimizado y `audit_log` intacto                          |
| 2.4 | Subida de imágenes a Supabase Storage con bucket y política                                                 | —    | 🟡   | **M**                                 | Un admin sube la foto de un plato desde la interfaz; se ve en la carta QR                                |
| 2.5 | Retirar los eventos `STOCK_OUT`, `DESPACHO` y los canales sin extremo                                       | 2.1  | 🟡   | **XS**                                | `socket-events.ts` describe únicamente canales y eventos con emisor y consumidor                         |
| 2.6 | Retirar los 8 esquemas Zod huérfanos y el ENUM `tipo_acceso_sala`                                           | —    | ⚪   | **XS**                                | `grep` del nombre de cada esquema devuelve 0 resultados fuera de su definición… porque ya no existe      |
| 2.7 | Quitar `mv_cogs_per_passenger` de `refresh_analytics_views`                                                 | —    | ⚪   | **XS**                                | La función solo itera sobre vistas existentes                                                            |

---

## Fase 3 — Funcionalidades faltantes

| #   | Tarea                                                                    | Dep. | Prio | Compl. | Criterio de aceptación                                                                                                |
| --- | ------------------------------------------------------------------------ | ---- | ---- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 3.1 | Ajuste y conteo físico de inventario (UI + acción con idempotencia)      | —    | 🟠   | **M**  | Un almacenero registra un conteo; la diferencia genera un movimiento `ajuste` visible en la analítica                 |
| 3.2 | Ampliar la vista de analítica con dimensiones **nodo** y **responsable** | 1.1  | 🟠   | **L**  | Los cuatro filtros que `CLAUDE.md` declara obligatorios (turno, nodo, responsable, período) funcionan                 |
| 3.3 | Cola offline generalizada para Stock Out, merma y despacho               | —    | 🟡   | **L**  | Con la red caída, un stock out queda en cola y se sincroniza al volver, sin duplicar (la `idempotency_key` ya existe) |
| 3.4 | Historial de precios por insumo                                          | —    | 🟡   | **M**  | Se puede ver la evolución del coste unitario de un insumo a lo largo del tiempo                                       |
| 3.5 | Exportación de reportes (CSV como mínimo)                                | 3.2  | 🟡   | **M**  | Un admin descarga el consumo por turno; la clave `common.export` deja de estar sin uso                                |
| 3.6 | Vista combinada de KDS para admin (el "KDS monitor" de `CLAUDE.md`)      | —    | 🟡   | **M**  | Un admin ve las cuatro colas de cocina en una pantalla                                                                |

---

## Fase 4 — Seguridad y calidad

| #    | Tarea                                                                                       | Dep. | Prio | Compl.                  | Criterio de aceptación                                                                              |
| ---- | ------------------------------------------------------------------------------------------- | ---- | ---- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| 4.1  | `assertCan` a nivel de página en `/admin/costos` y `/admin/turnos`                          | —    | 🟡   | **XS**                  | Todas las páginas de `/admin` tienen dos capas de control                                           |
| 4.2  | Restringir el `UPDATE` de `alertas` a la columna `leida`                                    | —    | 🟡   | **S**                   | Un rol con `alertas:read` puede marcar leída pero no editar el mensaje                              |
| 4.3  | Revocar `INSERT/UPDATE/DELETE` sobre `audit_log` y `domain_events` a `anon`/`authenticated` | —    | 🟡   | **XS**                  | Los grants desaparecen; los triggers quedan como segunda capa                                       |
| 4.4  | `import 'server-only'` en `lib/supabase/admin.ts`                                           | —    | 🟡   | **XS**                  | El build falla si alguien lo importa desde un componente cliente                                    |
| 4.5  | Retirar `SUPABASE_JWT_SECRET` de `render.yaml` y rotar la clave (F-027)                     | —    | 🟠   | **XS** + acción externa | La variable desaparece del servicio y la clave se rota en Supabase                                  |
| 4.6  | Derivar `NAV_ITEMS` de `ROLE_ALLOWED_PREFIXES` o añadir prueba de coherencia                | —    | 🟡   | **S**                   | Una prueba falla si ambas listas divergen                                                           |
| 4.7  | Caché con TTL para `assertSesionVigente`                                                    | —    | 🟡   | **M**                   | El número de consultas a `users` por sesión cae; una desactivación sigue surtiendo efecto en ≤ 60 s |
| 4.8  | Migrar `next lint` a la CLI de ESLint                                                       | —    | 🟡   | **S**                   | `pnpm lint` no emite avisos de deprecación                                                          |
| 4.9  | Añadir script `lint` a los dos paquetes compartidos                                         | 4.8  | 🟡   | **XS**                  | `pnpm lint` recorre 4 proyectos, no 2                                                               |
| 4.10 | Política de contraseñas por encima de 8 caracteres                                          | —    | ⚪   | **XS**                  | El alta de usuario rechaza contraseñas débiles                                                      |

---

## Fase 5 — Testing

| #   | Tarea                                                                                                                               | Dep.     | Prio | Compl. | Criterio de aceptación                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- | ------ | ------------------------------------------------------------------------------------------------------ |
| 5.1 | **Prueba de coherencia de canales de socket**: todo componente que escucha un evento debe unirse al canal donde ese evento se emite | 1.5, 1.6 | 🟠   | **M**  | La prueba falla contra el estado anterior a 1.5 y pasa después. Es lo que impide que H-C y H-E vuelvan |
| 5.2 | Testing Library sobre los flujos críticos: `PedidoCard`, `TurnoGuard`, `AlertasBell`, diálogos de inventario                        | —        | 🟠   | **L**  | Cobertura funcional de los componentes que operan el negocio                                           |
| 5.3 | Ampliar el `include` de cobertura a `modules/*/infrastructure/`                                                                     | —        | 🟡   | **S**  | El umbral se calcula sobre una fracción mayor del código ejecutable                                    |
| 5.4 | Pruebas de la cola offline (IndexedDB)                                                                                              | 3.3      | 🟡   | **M**  | El ciclo encolar → reconectar → sincronizar → no duplicar está probado                                 |
| 5.5 | Prueba de RLS para el camino de analítica del superuser                                                                             | 1.3      | 🟠   | **S**  | Cubre el hueco de H-B                                                                                  |

**Nota de método:** la Fase 5 no va al final por casualidad, pero **5.1 y 5.5 deberían
adelantarse a la Fase 1**. La regla del propio repositorio —_"escríbela en rojo antes del
arreglo y comprueba que efectivamente falla"_— aplica exactamente aquí.

---

## Fase 6 — Producción

| #   | Tarea                                                                                                                                                                        | Dep. | Prio | Compl. | Criterio de aceptación                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------ | ----------------------------------------------------------------------------------------- |
| 6.1 | Verificar las acciones de configuración externa pendientes: rotación de `SUPABASE_JWT_SECRET`, registro público deshabilitado en Supabase Auth, `ALLOW_LEGACY_HS256` apagada | 4.5  | 🟠   | **S**  | Las tres quedan confirmadas por escrito. Esta auditoría **no** pudo verificarlas          |
| 6.2 | Monitor HTTP contra `/health` en Better Stack (riesgo residual de F-011)                                                                                                     | —    | 🟠   | **XS** | Una caída se detecta en minutos, no en las hasta 24 h del latido diario actual            |
| 6.3 | Probar la restauración de un backup de extremo a extremo                                                                                                                     | —    | 🟠   | **M**  | Un backup cifrado se restaura sobre una base limpia y las pruebas de RLS pasan sobre ella |
| 6.4 | Reducir el peso del bundle de `/inventario` y `/almacen`                                                                                                                     | —    | 🟡   | **M**  | Primera carga por debajo de 300 kB en las pantallas de sala                               |
| 6.5 | Temporizador único por tablero KDS en vez de uno por tarjeta                                                                                                                 | —    | 🟡   | **S**  | Un tablero con 20 pedidos ejecuta 1 intervalo, no 20                                      |
| 6.6 | Actualizar `CLAUDE.md` con las 9 contradicciones detectadas                                                                                                                  | —    | 🟠   | **S**  | La documentación de máxima precedencia deja de describir código que no existe             |

---

## Ruta más corta al valor

Si hubiera que elegir **un solo día de trabajo**, el orden es:

```
1.2 (prueba en rojo) → 1.1 (una línea) → 1.4 (una línea) → 1.3 → 1.5 → 1.6
```

Eso convierte la pantalla de analítica de rota a funcional, le da datos frescos, y hace que
las alertas y los pedidos QR lleguen a quien deben. Son cinco cambios pequeños que resuelven
los cinco hallazgos principales de esta auditoría.
