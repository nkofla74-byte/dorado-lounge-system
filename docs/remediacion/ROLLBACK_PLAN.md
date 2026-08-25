# Plan de rollback — remediación 2026-08-22

Cada migración lleva su bloque de reversión comentado al final del archivo. Este
documento da el orden y las advertencias.

## Principio

**El rollback de estas migraciones reabre agujeros de seguridad verificados.**
No es una operación de rutina. Antes de revertir cualquiera, considerar si el
problema real se resuelve con un _fix forward_.

## Orden de reversión

Inverso al de aplicación, respetando dependencias:

```
20260822000008  → suelta (revertir primero el módulo de inventario y costos)
20260822000007  → suelta
20260822000006  → suelta
20260822000005  → antes de 20260822000004
20260822000004  → antes de 20260822000002 si se revierte también la matriz
20260822000003  → antes de 20260822000002
20260822000002  → último de la cadena RBAC
20260822000001  → suelta
```

## Reversión por migración

| Migración                      | Cómo revertir                                                                                                                                                     | Qué se reabre                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `000001` handle_new_user       | Reaplicar el cuerpo de `0001_extensions_tenants_users.sql`                                                                                                        | **F-001: escalada a superuser por signup.** Deshabilitar antes el registro público.                 |
| `000002` matriz RBAC           | `DROP` de `fn_puede*`, `fn_jwt_*` y `rbac_permisos`                                                                                                               | Requiere revertir antes `000003`, que depende de esas funciones.                                    |
| `000003` políticas por permiso | Reaplicar las `FOR ALL` de 0003, 0005, 0006, proveedores, alertas, requisiciones y enterprise_audit_fixes; `GRANT DELETE`                                         | **F-002 (borrado físico) y F-036 (INSERT sin rol).**                                                |
| `000004` turno_id en ledger    | Reaplicar `20260615000000` y `20260527000002`                                                                                                                     | Analítica vuelve a quedar vacía. **Gate del dueño**: vuelve a hacer DDL destructivo.                |
| `000005` RPCs de pedidos       | `GRANT INSERT, UPDATE` sobre pedidos e hijas; reaplicar políticas de `20260611100000`, `20260527000001`, `20260601000001` y el `fn_crear_pedido` SECURITY INVOKER | **F-002: bypass del Principio Rector.** El código de la app debe revertirse en el mismo despliegue. |
| `000006` refresco de vistas    | Reaplicar `refresh_analytics_views` de `20260613000000`                                                                                                           | Las vistas quedan pobladas; un entorno nuevo volvería a fallar.                                     |
| `000007` `fn_crear_pedido_qr`  | `DROP FUNCTION`                                                                                                                                                   | Los pedidos QR vuelven a crearse sin atomicidad ni ruteo por área.                                  |
| `000008` merma y costos        | `DROP` de ambas funciones                                                                                                                                         | Requiere revertir antes el módulo de inventario a la secuencia de dos pasos.                        |

## Rollback del código sin rollback de la base

Es la combinación **más peligrosa**: si se revierte solo el despliegue web y la
base conserva `20260822000005`, la aplicación intentará `UPDATE` directo sobre
`pedidos` y todos los cambios de estado fallarán con error de privilegio. Los
KDS quedan inoperantes.

Si hay que revertir el web, revertir también las migraciones `000005` y `000007`.

## Reversión de dependencias

`next` 15.5.21 → 15.5.18 y los overrides de `package.json` se revierten con un
`git revert` del commit `2e5190b` seguido de `pnpm install --no-frozen-lockfile`.
Reabre tres SSRF/DoS de Next y deja el job `audit` de CI en rojo, lo que **bloquea
todo despliegue posterior** porque `deploy.yml` exige que CI concluya en success.

## Verificación tras un rollback

```bash
./scripts/sql-harness/run-tests.sh   # fallará: las pruebas asertan el estado corregido
pnpm lint && pnpm typecheck && pnpm test
```

Que la suite de RLS falle tras revertir es lo esperado y es la señal de qué
protecciones se han perdido.
