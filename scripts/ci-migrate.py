#!/usr/bin/env python3
"""Apply Supabase migrations via Management API (no direct DB connection needed).

Used in GitHub Actions to work around IPv6-only direct DB endpoints.
Requires: SUPABASE_ACCESS_TOKEN env var.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_REF = "gyewxgtuzjbxzcvcfmwy"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def api_query(sql: str) -> list:
    payload = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}") from e


def version_from_filename(name: str) -> str:
    m = re.match(r"^([^_]+)_", name)
    return m.group(1) if m else Path(name).stem


def main() -> None:
    migrations_dir = Path("supabase/migrations")
    files = sorted(migrations_dir.glob("*.sql"))
    if not files:
        print("No migration files found.")
        return

    applied = {
        row["version"]
        for row in api_query(
            "SELECT version FROM supabase_migrations.schema_migrations"
        )
    }
    print(f"Remote: {len(applied)} migration(s) already applied.")

    new_count = 0
    for f in files:
        version = version_from_filename(f.name)
        if version in applied:
            print(f"  ✓ {version}")
            continue

        print(f"  → {f.name} ... ", end="", flush=True)
        sql = f.read_text(encoding="utf-8")

        try:
            api_query(sql)
        except RuntimeError as exc:
            print(f"FAILED\n{exc}")
            sys.exit(1)

        # Record as applied (same schema as supabase CLI)
        api_query(
            "INSERT INTO supabase_migrations.schema_migrations "
            "(version, name, statements, created_by, idempotency_key, rollback) "
            f"VALUES ({json.dumps(version)}, {json.dumps(f.name)}, "
            "ARRAY[]::text[], 'ci-pipeline', "
            f"{json.dumps(version)}, ARRAY[]::text[]) "
            "ON CONFLICT (version) DO NOTHING"
        )
        new_count += 1
        print("OK")

    print(f"\n{new_count} migration(s) applied.")


if __name__ == "__main__":
    main()
