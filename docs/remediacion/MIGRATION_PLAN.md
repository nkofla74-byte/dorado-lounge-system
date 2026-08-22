# Plan de migración — remediación 2026-08-22

Ocho migraciones nuevas. Todas idempotentes y con bloque de rollback documentado
en su encabezado. Se aplican por CI (`scripts/ci-migrate.py`) en orden de nombre.

## Orden y dependencias

```
20260822000001_hardening_handle_new_user      (independiente)
20260822000002_rbac_matriz                    (independiente)
        │
        ├─► 20260822000003_politicas_por_permiso     (usa fn_puede_en_tenant)
        │
20260822000004_turno_id_en_ledger             (DDL destructivo — ver abajo)
        │
        ├─► 20260822000005_pedidos_rpc               (usa el FEFO de 9 argumentos)
        │           │
        │           └─► 20260822000007_crear_pedido_qr
        │
        └─► 20260822000008_merma_atomica_y_costos_batch

20260822000006_mv_refresh_inicial             (independiente)
```

## Migración con DDL destructivo: `20260822000004`

Es la única que hace `DROP FUNCTION`, y es deliberado.

Añadir `p_turno_id` con `CREATE OR REPLACE` **no** habría funcionado: PostgreSQL
trata una firma distinta como un _overload_ nuevo y deja la vieja huérfana. Ese
error exacto —un overload sin `REVOKE`, ejecutable por `authenticated`, sobre la
RPC más sensible del sistema— fue el hallazgo crítico que corrigió
`20260615000000`. Repetirlo habría reabierto un agujero de manipulación de
inventario cross-tenant.

Por eso se hace `DROP FUNCTION` explícito de la firma de 8 argumentos y se crea
una única de 9. `fn_completar_tanda`, su único llamador SQL, se recrea en la
misma migración. Una prueba (`f004_turno_en_ledger`) verifica que solo existe una
firma y que sigue sin ser ejecutable por `authenticated`.

**Requiere gate del dueño** según CLAUDE.md §Base de datos.

## Compatibilidad aplicación ↔ base

`20260822000005` revoca `INSERT`/`UPDATE` sobre `pedidos` y sus tablas hijas.
**La aplicación deja de funcionar si esa migración se aplica sin el código que la
acompaña.** Ambos viajan en el mismo commit y `deploy.yml` ya ordena migraciones
antes del despliegue web, así que existe una ventana de segundos en la que el
código viejo choca contra el esquema nuevo.

Para una sala 24/7 conviene desplegar en una ventana de baja ocupación. El fallo
en esa ventana es un error visible al usuario ("no se pudo guardar"), no una
corrupción: las escrituras se rechazan, no se aplican a medias.

## Verificación previa al despliegue

```bash
# Aplica las 76 migraciones sobre un Postgres limpio y ejecuta la suite de RLS.
./scripts/sql-harness/run-tests.sh
```

En CI esto es el job `rls`, con un servicio `postgres:15`. En local requiere un
cluster efímero; `scripts/sql-harness/apply.sh` acepta `PGROOT` (socket) o las
variables `PG*` estándar. **No usa Docker ni `supabase start`**, en línea con
CLAUDE.md.

## Datos preexistentes

Ninguna migración altera filas existentes salvo el poblado inicial de las vistas
materializadas. Dos situaciones heredadas quedan fuera de alcance y necesitan
decisión del dueño:

1. **Movimientos históricos sin `turno_id`** (F-004). La analítica por turno solo
   cubrirá desde el despliegue. Un backfill es posible por
   `referencia_id → pedidos.turno_id` para los movimientos de tipo pedido, pero
   los de tanda y merma no tienen forma fiable de reconstruirse.
2. **Pedidos QR anteriores con `area_produccion` nula** (F-007). Están bloqueados
   en `creado`/`recibido_cocina` y solo se pueden cancelar. Un backfill por
   `recetas.area_produccion` los desbloquearía; conviene revisarlos antes porque
   pueden ser pedidos que nunca se sirvieron.

## Rollback

Ver ROLLBACK_PLAN.md. Cada migración documenta su reversión en el propio archivo.
