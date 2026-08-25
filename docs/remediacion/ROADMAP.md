# Roadmap de remediación — auditoría forense 2026-08-22

## Estado

**35 de 36 hallazgos cerrados.** El único abierto (F-026) requiere una decisión
de producto, documentada en ARCHITECTURE_DECISIONS §ADR-005.

## Orden que se siguió y por qué

La secuencia no fue por severidad sino por **dependencia**: cerrar un bypass
antes de optimizar lo que pasa por él.

### Fase 1 — Cimientos de autorización

1. **F-001** (escalada por signup). Independiente y crítico: mientras existiera,
   cualquier otra defensa era decorativa, porque el atacante podía ser superuser.
2. **RC-2** (matriz RBAC en base). Prerrequisito de todo lo demás: sin `fn_puede()`
   las políticas nuevas habrían vuelto a llevar listas de roles a mano.
3. **F-036, F-006, F-035** (políticas por permiso, `REVOKE DELETE`).

### Fase 2 — Frontera transaccional

4. **F-004** (`turno_id` en el ledger). Antes que las RPCs de pedidos, porque
   `fn_entregar_pedido` necesita la firma nueva del FEFO.
5. **F-002, F-008, F-009** (RPCs de pedidos). El bloque grande: escritura,
   atomicidad y concurrencia en un solo cambio coherente.

### Fase 3 — Resto de altos

6. **F-003** (revocación de sesión), **F-005** (vistas materializadas),
   **F-007/F-018** (camino QR), **F-010** (dependencias).

### Fase 4 — Medios y bajos

7. Observabilidad e infraestructura, endurecimiento de aplicación, atomicidad de
   merma, rendimiento de costos, login server-side, CSP con nonce, cobertura.

### Fase 5 — Verificación y documentación

8. Job `rls` en CI y estos ocho documentos.

## Riesgo por fase

| Fase | Riesgo de despliegue                                                                   | Mitigación                                                             |
| ---- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Bajo. Solo cambia el alta de usuarios y añade políticas.                               | El aprovisionamiento server-side ya existía en `reset-test-users`.     |
| 2    | **Alto.** Revoca la escritura directa sobre pedidos: código y esquema deben ir juntos. | Mismo commit; desplegar en ventana de baja ocupación (MIGRATION_PLAN). |
| 3    | Medio. El bump de Next toca todo el frontend.                                          | Build verificado; es un parche dentro de la misma mayor.               |
| 4    | Bajo.                                                                                  | —                                                                      |

## Trabajo pendiente

### Requiere decisión del dueño

- **ADR-005 (F-026)**: unificar la autoridad sobre `pedidos.estado`. Recomendación
  en el propio ADR.
- **Backfill de datos heredados**: movimientos sin `turno_id` y pedidos QR
  bloqueados sin área. Ver MIGRATION_PLAN §Datos preexistentes.
- **TTL del token QR**: el código dice 12 h, la documentación decía 4 h. Se
  documentó el valor real; bajarlo es decisión de negocio.

### Configuración fuera del repositorio

Cinco acciones, ordenadas por urgencia, en SECURITY_CHANGES §Pendiente de
configuración. Las dos primeras son **rotar la service_role key** y **activar el
CAPTCHA nativo de Supabase Auth**.

### Deuda técnica que la auditoría dejó a la vista

1. **Componentes React sin cobertura** (127 archivos). Es el mayor hueco que
   queda: sin pruebas de renderizado, estados de carga/error ni accesibilidad.
2. **E2E no ejecutados** en esta remediación.
3. **Lecturas RLS sin filtro de permiso** (ADR-004), aceptado conscientemente.
4. **`scripts/**`y`seed.sql`\*\* sin auditar ni probar.

## Cómo no volver aquí

Los tres mecanismos que hacen estructural la corrección, no puntual:

1. **La matriz RBAC se genera** desde TypeScript; una prueba detecta la deriva.
   Esto mata RC-2 de raíz.
2. **El job `rls` en CI** prueba las políticas contra Postgres real. F-002 y
   F-036 existieron porque esa capa no tenía ninguna prueba.
3. **La cobertura ya incluye** autorización, casos de uso y seguridad, no solo el
   dominio puro.
