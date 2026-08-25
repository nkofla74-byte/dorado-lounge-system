#!/usr/bin/env bash
# Ejecuta la suite de pruebas de RLS/RPC contra una base efímera.
# Reconstruye el esquema desde cero (migraciones + fixture) y corre cada prueba
# en su propia transacción, que se revierte al terminar.
set -uo pipefail
DB=${DB:-dorado_test}
HARNESS="$(cd "$(dirname "$0")" && pwd)"

if [ -n "${PGROOT:-}" ]; then
  export PGHOST="$PGROOT/sock"
fi
export PGUSER="${PGUSER:-postgres}"

"$HARNESS/apply.sh" "$DB" > /dev/null || { echo "FALLO aplicando migraciones"; exit 1; }
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HARNESS/20_test_helpers.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HARNESS/10_seed.sql"

pass=0; fail=0; failed_names=()
for t in "$HARNESS"/tests/*.sql; do
  name=$(basename "$t" .sql)
  out=$( { echo "BEGIN;"; cat "$t"; echo "ROLLBACK;"; } | psql -v ON_ERROR_STOP=1 -q -d "$DB" 2>&1 )
  if [ $? -eq 0 ]; then
    pass=$((pass+1)); echo "  ✓ $name"
  else
    fail=$((fail+1)); failed_names+=("$name")
    echo "  ✗ $name"
    echo "$out" | grep -E "ERROR|ASSERT" | head -4 | sed 's/^/      /'
  fi
done

echo ""
echo "RLS/RPC: $pass pasaron, $fail fallaron"
[ "$fail" -eq 0 ] || { printf '   fallidas: %s\n' "${failed_names[*]}"; exit 1; }
