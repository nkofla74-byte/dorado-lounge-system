#!/usr/bin/env python3
"""Export Dorado Lounge DB via Supabase Management API as SQL INSERT statements.

This is a logical backup (not pg_dump binary format) — suitable for disaster
recovery and point-in-time restore. Runs without direct DB connectivity.

Usage: python3 scripts/ci-backup.py <output_file.sql>
Requires: SUPABASE_ACCESS_TOKEN env var.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF")
if not PROJECT_REF:
    print("ERROR: SUPABASE_PROJECT_REF env var is required", file=sys.stderr)
    sys.exit(1)
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

# Tables to back up, in dependency order (parent before child)
TABLES = [
    "public.tenants",
    "public.feature_flags",
    "public.users",
    "public.turnos",
    "public.proveedores",
    "public.insumos",
    "public.lotes",
    "public.recetas",
    "public.receta_ingredientes",
    "public.tandas_produccion",
    "public.despachos",
    "public.movimientos_inventario",
    "public.pedidos",
    "public.pedido_items",
    "public.pedido_eventos",
    "public.buffet_tickets_turno",
    "public.mermas",
    "public.mensajes_chat",
    "public.afluencia_ingresos",
    "public.alertas",
    "public.domain_events",
    "public.audit_log",
    "public.operaciones_idempotentes",
    "supabase_migrations.schema_migrations",
]


def api_query(sql: str) -> list:
    payload = json.dumps({"query": sql})
    result = subprocess.run(
        [
            "curl", "-s", "-X", "POST", API_URL,
            "-H", f"Authorization: Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
            "-H", "Content-Type: application/json",
            "-H", "Accept: application/json",
            "-d", payload,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl error {result.returncode}: {result.stderr}")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"Non-JSON response: {result.stdout[:300]}")
    if isinstance(data, dict) and ("message" in data or "error" in data):
        raise RuntimeError(f"API error: {result.stdout[:300]}")
    return data


def quote_value(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        # PostgreSQL array
        inner = ",".join(quote_value(x) for x in v)
        return f"ARRAY[{inner}]"
    # String — escape single quotes
    escaped = str(v).replace("'", "''")
    return f"'{escaped}'"


def dump_table(table: str, f) -> int:
    rows = api_query(f"SELECT * FROM {table} ORDER BY 1 LIMIT 50000")
    if not rows:
        return 0
    cols = list(rows[0].keys())
    col_list = ", ".join(f'"{c}"' for c in cols)
    f.write(f"\n-- {table} ({len(rows)} rows)\n")
    for row in rows:
        vals = ", ".join(quote_value(row[c]) for c in cols)
        f.write(f"INSERT INTO {table} ({col_list}) VALUES ({vals}) ON CONFLICT DO NOTHING;\n")
    return len(rows)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: ci-backup.py <output.sql>")
        sys.exit(1)

    outfile = sys.argv[1]
    now = datetime.now(timezone.utc).isoformat()

    with open(outfile, "w", encoding="utf-8") as f:
        f.write(f"-- Dorado Lounge logical backup\n")
        f.write(f"-- Generated: {now}\n")
        f.write(f"-- Project: {PROJECT_REF}\n\n")
        f.write("SET session_replication_role = replica;\n")

        total = 0
        for table in TABLES:
            print(f"  → {table} ...", end=" ", flush=True)
            try:
                count = dump_table(table, f)
                total += count
                print(f"{count} rows")
            except RuntimeError as e:
                print(f"SKIP ({e})")

        f.write("\nSET session_replication_role = DEFAULT;\n")

    print(f"\nTotal: {total} rows exported to {outfile}")


if __name__ == "__main__":
    main()
