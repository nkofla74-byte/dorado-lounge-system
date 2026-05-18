#!/usr/bin/env bash
#
# Configura los secrets de GitHub Actions para Dorado Lounge.
# Idempotente: corre las veces que quieras; sólo sobreescribe los que respondas.
# Los valores NUNCA salen del terminal local (no se pasan por argv ni se guardan).
#
# Uso:
#   ./scripts/setup-github-secrets.sh
#
# Prerequisitos:
#   - gh CLI autenticado (gh auth status)
#   - Estar dentro del repo

set -euo pipefail

if ! command -v gh &>/dev/null; then
  echo "✗ gh CLI no está instalado. Instálalo y autentícate: gh auth login"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "✗ gh CLI no está autenticado. Corre: gh auth login"
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "→ Configurando secrets en: ${REPO}"
echo

# Lee un valor sensible sin echo y lo setea via gh secret set.
# Si el usuario sólo aprieta Enter, salta ese secret.
set_secret() {
  local name="$1"
  local hint="$2"
  printf "%-40s  %s\n" "$name" "$hint"
  printf "  valor (Enter para saltar): "
  read -rs value
  printf "\n"
  if [[ -z "$value" ]]; then
    echo "  ⏭  saltado"
    return
  fi
  printf '%s' "$value" | gh secret set "$name" --body -
  echo "  ✓ seteado"
  echo
}

echo "─── Vercel (deploy) ─────────────────────────────────────────"
set_secret VERCEL_TOKEN "vercel.com → Account Settings → Tokens"

echo "─── Supabase (deploy + backup) ──────────────────────────────"
set_secret SUPABASE_DB_URL      "Supabase → Settings → Database → Connection string → URI"
set_secret SUPABASE_DB_HOST     "Supabase → Settings → Database → Host (db.<ref>.supabase.co)"
set_secret SUPABASE_DB_PASSWORD "Supabase → Settings → Database → Password"

echo "─── Sentry (release sourcemaps) ─────────────────────────────"
set_secret SENTRY_AUTH_TOKEN "sentry.io → Settings → Auth Tokens → Create (scope: project:releases)"
set_secret SENTRY_ORG        "sentry.io → tu organización slug (ej: gisat)"
set_secret SENTRY_PROJECT    "sentry.io → tu project slug (ej: dorado-lounge)"

echo "─── Better Stack (monitoring) ───────────────────────────────"
set_secret BETTERSTACK_HEARTBEAT_URL        "Better Stack → Monitor de heartbeat principal → URL"
set_secret BETTERSTACK_BACKUP_HEARTBEAT_URL "Better Stack → Monitor separado para backup nocturno"

echo "─── Resumen ─────────────────────────────────────────────────"
gh secret list
echo
echo "→ Hecho. Re-corre los workflows fallados con:"
echo "  gh run rerun --failed -R ${REPO}"
