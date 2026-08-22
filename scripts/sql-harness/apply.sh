#!/usr/bin/env bash
# Aplica el shim + todas las migraciones en orden sobre una base efímera.
# Uso: scripts/sql-harness/apply.sh [nombre_db]
set -euo pipefail
PGROOT=${PGROOT:-/var/tmp/pgv}
DB=${1:-dorado}
HARNESS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HARNESS/../.." && pwd)"
export PGHOST="$PGROOT/sock" PGUSER=postgres

dropdb --if-exists "$DB"
createdb "$DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HARNESS/00_supabase_shim.sql"

# pg_cron y pg_net no existen en un Postgres vanilla: el shim ya aporta stubs
# equivalentes (cron.schedule / net.http_post), así que se omite su CREATE EXTENSION.
TMPMIG=$(mktemp -d)
trap 'rm -rf "$TMPMIG"' EXIT

for f in "$REPO"/supabase/migrations/*.sql; do
  sed -E 's/^([[:space:]]*)(CREATE EXTENSION[^;]*pg_(cron|net)[^;]*;)/\1-- [harness] \2/' "$f" > "$TMPMIG/$(basename "$f")"
  f="$TMPMIG/$(basename "$f")"
  if ! psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" > /tmp/mig.out 2>&1; then
    echo "FALLO: $(basename "$f")"
    tail -25 /tmp/mig.out
    exit 1
  fi
done
echo "OK: $(ls "$REPO"/supabase/migrations/*.sql | wc -l) migraciones aplicadas en '$DB'"
