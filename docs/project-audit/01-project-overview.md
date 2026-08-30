# 01 · Visión general del proyecto

## Identidad

| Dato               | Valor                                                    |
| ------------------ | -------------------------------------------------------- |
| Nombre del paquete | `dorado-lounge-system` (privado, v1.0.0)                 |
| Cliente / dominio  | GISAT S.A. — Dorado Lounge, aeropuerto El Dorado, Bogotá |
| Modelo             | SaaS multi-tenant; el cliente adquiere licencia de uso   |
| Gestor de paquetes | pnpm 10.33.2 (workspaces)                                |
| Runtime            | Node.js 22                                               |
| Repositorio        | `nkofla74-byte/dorado-lounge-system`                     |
| Commit auditado    | `828ab9d`                                                |

## Qué resuelve

Una sala VIP de aeropuerto opera 24/7 con turnos rotativos, personal que trabaja con guantes
sobre tabletas, y un inventario perecedero cuyo coste hay que imputar a cada plato servido.
El sistema une cuatro procesos que en una sala típica viven en papel o en hojas de cálculo:

1. **Bodega** — recepción de lotes con proveedor, coste y vencimiento; alertas de stock y caducidad.
2. **Recetario** — recetas de producción (capa 1 → capa 2) y de servicio (capa 1/2 → zona).
3. **Cocina** — cuatro pantallas KDS independientes (cocina caliente, cocina fría, pastelería,
   AMEX) con estado por ítem, cronómetro y alertas de demora.
4. **Sala** — pedidos desde tres zonas (AMEX con mesero, Snack y Buffet autoservicio) y una
   carta digital por QR para el pasajero.

## El principio que gobierna todo el diseño

> **Nada sale de cocina sin receta.**

Todo movimiento de inventario está vinculado a una receta. La merma se aplica **una sola vez**,
en la recepción, mediante `insumos.merma_default`; el inventario guarda ya la cantidad neta.
El consumo descuenta cantidades netas directas. No existe descuento sin receta.

Este principio está **enforzado en la base de datos**, no solo en la aplicación: existe una
prueba de RLS (`f002_principio_rector.sql`) que falla si alguien logra descontar inventario
por escritura directa desde PostgREST. Se ejecutó en esta auditoría y pasa.

## Superficie del producto

| Métrica                        | Valor medido                   |
| ------------------------------ | ------------------------------ |
| Ficheros TypeScript/TSX        | 338 (65 de ellos son pruebas)  |
| Líneas de código de producción | 28 156                         |
| Líneas de código de pruebas    | 7 225                          |
| Componentes React              | 78                             |
| Páginas (`page.tsx`)           | 24                             |
| Route handlers (`route.ts`)    | 4                              |
| Server Actions exportadas      | 81                             |
| Migraciones SQL                | 80 (7 358 líneas)              |
| Tablas en base de datos        | 25                             |
| Funciones SQL propias          | 33 (sin contar `pgcrypto`)     |
| Políticas RLS                  | 48 sobre 22 tablas             |
| Roles de usuario activos       | 11 (+ 2 inertes por histórico) |
| Claves de traducción es/en     | 989 cada una (paridad exacta)  |

## Estado de madurez

El repositorio no es un prototipo. Tiene historia de auditorías previas (`docs/audit/`),
una remediación forense documentada con 36 hallazgos y 35 cerrados
(`docs/remediacion/`), ADRs, planes de rollback y un arnés de pruebas de RLS contra Postgres
real. La disciplina de ingeniería es alta y verificable.

Lo que falla no es el rigor, sino **la cobertura**: las áreas con pruebas automáticas están
sanas; las que no las tienen (la lectura de analítica, el `join` de los canales de socket)
son exactamente donde viven los defectos que encontró esta auditoría.

## Documentos de referencia internos

| Fichero                                                     | Contenido                                               |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `CLAUDE.md`                                                 | Contrato operativo del repositorio. Máxima precedencia. |
| `ARCHITECTURE.md` (90 KB)                                   | ADRs, modelo ER, algoritmos                             |
| `docs/remediacion/ESTADO-Y-PROXIMOS-PASOS.md`               | Punto de retomada tras la remediación de agosto 2026    |
| `docs/remediacion/REMEDIATION_TRACKER.md`                   | Estado de los 36 hallazgos forenses                     |
| `docs/audit/cerberus/`, `docs/audit/2026-05-27-enterprise/` | Auditorías anteriores                                   |
