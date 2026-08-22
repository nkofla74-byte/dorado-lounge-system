# Arnés de pruebas de RLS y RPC

Aplica todas las migraciones sobre un PostgreSQL limpio y ejecuta pruebas de
autorización **contra una base real**, simulando sesiones de PostgREST.

Existe porque las políticas RLS y las RPC `SECURITY DEFINER` eran el único código
del repositorio sin cobertura automática. Es exactamente donde vivían los dos
hallazgos más graves de la auditoría 2026-08-22 (F-002 y F-036).

```bash
./scripts/sql-harness/run-tests.sh
```

## Requisitos

Un PostgreSQL accesible. El script respeta las variables `PG*` estándar
(`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`) y necesita `psql` en el PATH.

**No usa Docker ni `supabase start`**, en línea con CLAUDE.md.

### En CI

El job `rls` de `.github/workflows/ci.yml` levanta un servicio `postgres:15`. No
hay que hacer nada.

### En local

Si tienes un PostgreSQL corriendo, basta con exportar las `PG*`. Si no, se puede
levantar un cluster efímero con las herramientas que ya trae PostgreSQL, sin
Docker:

```bash
PGROOT=/var/tmp/pgv
rm -rf "$PGROOT" && mkdir -p "$PGROOT/data" "$PGROOT/sock"
chown -R postgres:postgres "$PGROOT" && chmod 755 "$PGROOT"

# Ajusta la versión al binario que tengas instalado.
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGROOT/data -U postgres --auth=trust"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGROOT/data \
  -l $PGROOT/pg.log -o \"-k $PGROOT/sock -h ''\" -w start"

PGROOT=$PGROOT ./scripts/sql-harness/run-tests.sh
```

Con `PGROOT` definido el script usa el socket de ese cluster. La ruta debe ser
corta: el límite de un socket Unix es de 107 bytes.

Para pararlo y borrarlo:

```bash
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgv/data stop"
rm -rf /var/tmp/pgv
```

## Cómo está montado

| Archivo                | Qué hace                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_supabase_shim.sql` | Reproduce lo que Supabase da de fábrica: schema `auth`, `auth.jwt()`/`auth.uid()`, roles `anon`/`authenticated`/`service_role`, y stubs de `pg_cron`, `pg_net` y `vault`. **Solo para pruebas; no se despliega.** |
| `10_seed.sql`          | Fixture determinista con ids fijos: dos tenants, nueve usuarios cubriendo los roles, insumos de capa 1 y 2, lotes, recetas y un turno activo.                                                                     |
| `20_test_helpers.sql`  | `test.login(uuid)` fija `request.jwt.claims` y `SET LOCAL ROLE authenticated`, igual que hace PostgREST. Más `test.assert`, `test.exec_count` y `test.expect_error`.                                              |
| `apply.sh`             | Recrea la base y aplica las migraciones en orden.                                                                                                                                                                 |
| `run-tests.sh`         | Aplica + siembra + ejecuta cada prueba en su transacción, que revierte al terminar.                                                                                                                               |
| `tests/*.sql`          | Una suite por hallazgo. El nombre lleva el identificador.                                                                                                                                                         |

## Añadir una prueba

Un archivo en `tests/` que lance excepción al fallar. Convención: nombrarlo por
el hallazgo que protege.

```sql
DO $$
BEGIN
  PERFORM test.login('aaaaaaaa-0000-0000-0000-000000000002');  -- mesero_amex
  PERFORM test.assert(
    test.exec_count('UPDATE public.pedidos SET estado = ''entregado''') <= 0,
    'un mesero marcó el pedido como entregado por escritura directa');
  PERFORM test.logout();
END $$;
```

`test.exec_count` devuelve las filas afectadas, o `-1` si el motor denegó por
privilegio de tabla. Eso permite distinguir «denegado por GRANT» de «invisible
por RLS» (0 filas), que son cosas distintas.

Ojo con el dollar-quoting: dentro de un bloque `DO $$ ... $$`, las cadenas
anidadas necesitan otra etiqueta (`$q$ ... $q$`).

## Regla

**Cada defecto corregido deja una prueba que falla si vuelve.** Escríbela en rojo
antes del arreglo y comprueba que efectivamente falla; si no, no estás probando
lo que crees.
