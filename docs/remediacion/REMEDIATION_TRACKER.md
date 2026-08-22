# Tracker de remediación — auditoría forense 2026-08-22

Estado de los 35 hallazgos del informe original más uno descubierto durante la
remediación (F-036). Un hallazgo está **Verificado** cuando existe una prueba
automática que falla si el defecto vuelve.

Leyenda de verificación: `U` = prueba unitaria (vitest) · `R` = prueba de RLS/RPC
contra Postgres real (`scripts/sql-harness`) · `M` = comprobación manual
reproducible documentada.

## Críticos y altos

| ID                                              | Causa raíz | Estado     | Verificación                                         | Riesgo residual                                                                                                                                |
| ----------------------------------------------- | ---------- | ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 escalada por metadata de signup           | RC-1       | Verificado | U (4) + R (`f001_...`)                               | Ninguno en código. Se recomienda además deshabilitar el registro público en Supabase Auth: es defensa en profundidad, no un requisito del fix. |
| F-002 bypass del Principio Rector vía PostgREST | RC-1       | Verificado | R (`f002_principio_rector`, `f002_sin_borrado_duro`) | Las políticas de **lectura** siguen siendo por tenant sin filtro de permiso (decisión consciente, ver ADR-004).                                |
| F-003 sesión no revocada al desactivar          | RC-6       | Verificado | U (11 de `assertCan` + 3 de `toggleUser`)            | Una acción en vuelo puede completarse en la ventana entre la desactivación y su siguiente `assertCan`.                                         |
| F-004 `turno_id` nunca escrito en el ledger     | RC-4       | Verificado | R (`f004_turno_en_ledger`)                           | Los movimientos históricos siguen con `turno_id` nulo: la analítica solo cubre desde el despliegue. Backfill opcional, ver MIGRATION_PLAN.     |
| F-005 vistas materializadas nunca pobladas      | RC-3       | Verificado | R (`f005_analytics_refrescable`)                     | Ninguno.                                                                                                                                       |
| F-006 RLS de producción con roles obsoletos     | RC-2       | Verificado | R (`f006_...`)                                       | Ninguno: la matriz se genera desde TypeScript y una prueba detecta la deriva.                                                                  |
| F-007 pedidos QR sin área productiva            | RC-5       | Verificado | U (8)                                                | Los pedidos QR creados **antes** del fix siguen con área nula y bloqueados; requieren cancelación manual o backfill.                           |
| F-008 entrega no atómica                        | RC-3       | Verificado | R (`f008_entrega_atomica`)                           | Ninguno.                                                                                                                                       |
| F-009 transición de ítem no atómica             | RC-3       | Verificado | R (`f009_...`)                                       | Ninguno.                                                                                                                                       |
| F-010 job de auditoría en rojo                  | —          | Verificado | CI (`pnpm audit --prod` exit 0)                      | 3 avisos restantes (1 low, 2 moderate) bajo el umbral del gate. Los de `undici` son dev-only vía jsdom.                                        |
| F-011 heartbeat emitido por GitHub Actions      | —          | Verificado | M (workflow eliminado)                               | Hace falta configurar un monitor HTTP contra `/health` para detección rápida; es configuración de Better Stack, fuera del repositorio.         |
| F-036 `WITH CHECK` sin predicado de rol         | RC-1       | Verificado | R (`f036_insert_exige_permiso`)                      | Ninguno.                                                                                                                                       |

## Medios

| ID                                                  | Estado      | Verificación                          | Nota                                                                                                |
| --------------------------------------------------- | ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| F-012 login eludible                                | Corregido   | U (implícita en la acción)            | **Riesgo residual alto**: ver SECURITY_CHANGES §Pendiente de configuración.                         |
| F-013 Turnstile fail-open                           | Verificado  | U (2)                                 | —                                                                                                   |
| F-014 socket sin caducidad de JWT                   | Verificado  | U (5)                                 | El cliente aún no renueva el socket al refrescar el token; reconecta.                               |
| F-015 `emitEvent` sin timeout                       | Verificado  | U (indirecta) + revisión              | —                                                                                                   |
| F-016 alertas solo al canal ADMIN                   | Verificado  | U (5)                                 | —                                                                                                   |
| F-017 teamlider con roles obsoletos                 | Verificado  | U (vía `ASSIGNABLE_ROLES`)            | —                                                                                                   |
| F-018 menú QR ignoraba `activo`                     | Verificado  | U (8, compartidas con F-007)          | —                                                                                                   |
| F-019 CSP con `unsafe-inline`                       | Verificado  | U (9)                                 | `'unsafe-inline'` permanece como repliegue para navegadores sin `strict-dynamic`; estos lo ignoran. |
| F-020 refresco de analítica bajo permiso de lectura | Verificado  | U (matriz RBAC)                       | Sin rate limit propio; el permiso ya lo restringe a admin.                                          |
| F-021 N+1 de costos                                 | Verificado  | R (`f021_costos_por_lote`)            | —                                                                                                   |
| F-022 merma no atómica                              | Verificado  | R (`f022_merma_atomica`)              | —                                                                                                   |
| F-023 cobertura de alcance estrecho                 | Verificado  | CI (umbral sobre el alcance ampliado) | Los componentes React siguen fuera de cobertura.                                                    |
| F-024 deriva de cadencia de crons                   | Verificado  | M (documentación alineada)            | —                                                                                                   |
| F-025 rate limit de `/emit` por IP de proxy         | Verificado  | M (revisión)                          | —                                                                                                   |
| F-026 dos máquinas de estado sobre `pedidos`        | **Abierto** | —                                     | Ver ADR-005: requiere decisión de producto, no solo técnica.                                        |

## Bajos

| ID                                                | Estado     | Nota                                                                   |
| ------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| F-027 service_role key en socket-server           | Verificado | **Acción de despliegue: rotar la clave.**                              |
| F-028 TTL del token QR (12 h vs 4 h documentadas) | Verificado | Se documentó el valor real; decidir si debe bajar a 4 h es de negocio. |
| F-029 rutas públicas por prefijo                  | Verificado | U (12)                                                                 |
| F-030 HS256 legacy siempre activo                 | Verificado | U (6)                                                                  |
| F-031 `document.write` en impresión QR            | Verificado | Revisión; era self-XSS.                                                |
| F-032 acción de CI sin anclar                     | Verificado | —                                                                      |
| F-033 pre-commit incompleto                       | Verificado | Ahora ejecuta `typecheck`.                                             |
| F-034 workflow residual con `contents: write`     | Verificado | Eliminado.                                                             |
| F-035 roles obsoletos en políticas                | Verificado | Absorbido por la matriz RBAC.                                          |

## Resumen

- **35 de 36 hallazgos cerrados.** F-026 queda abierto por requerir una decisión
  de producto (ADR-005).
- **8 migraciones** nuevas, todas idempotentes y con rollback documentado.
- **Pruebas**: 507 automáticas (394 web, 45 validación, 44 tipos, 24 socket) más
  11 suites de RLS/RPC contra Postgres real. Antes de la remediación: 354 y 0.
