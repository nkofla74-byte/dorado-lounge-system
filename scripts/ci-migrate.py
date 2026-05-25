#!/usr/bin/env python3
"""Apply Supabase migrations via Management API.

Uses curl for HTTP (avoids Python urllib TLS fingerprint blocked by Cloudflare
from GitHub Actions runners). Requires: SUPABASE_ACCESS_TOKEN env var.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT_REF = "gyewxgtuzjbxzcvcfmwy"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def api_query(sql: str) -> list:
    payload = json.dumps({"query": sql})
    result = subprocess.run(
        [
            "curl",
            "-sf",
            "-X", "POST",
            API_URL,
            "-H", f"Authorization: Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
            "-H", "Content-Type: application/json",
            "-H", "Accept: application/json",
            "--data-raw", payload,
            "--fail-with-body",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"curl failed (exit {result.returncode}): {result.stdout[:500]}"
        )
    data = json.loads(result.stdout)
    if isinstance(data, dict) and "message" in data:
        raise RuntimeError(f"API error: {data['message']}")
    return data


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
