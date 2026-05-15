#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-local.sh — Sincroniza el repositorio local con la rama main de GitHub
#
# Uso:
#   chmod +x sync-local.sh
#   ./sync-local.sh
#
# El script detecta si ya tienes el repo clonado o lo clona desde cero.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="https://github.com/nkofla74-byte/dorado-lounge-system.git"
REPO_DIR="dorado-lounge-system"
BRANCH="main"
REQUIRED_NODE_MAJOR=20

# ── Colores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
error()   { echo -e "${RED}✗ $*${NC}"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Dorado Lounge System — Sync Local      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Verificar Node.js ──────────────────────────────────────────────────────
info "Verificando Node.js..."
if ! command -v node &>/dev/null; then
  error "Node.js no está instalado. Instálalo desde https://nodejs.org (v${REQUIRED_NODE_MAJOR}+)"
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  error "Node.js v${NODE_MAJOR} detectado. Se requiere v${REQUIRED_NODE_MAJOR}+. Actualiza en https://nodejs.org"
fi
success "Node.js v$(node --version) OK"

# ── 2. Verificar / instalar pnpm via corepack ─────────────────────────────────
info "Verificando pnpm..."
if ! command -v pnpm &>/dev/null; then
  warn "pnpm no encontrado — activando via corepack..."
  corepack enable
  corepack prepare pnpm@10.33.2 --activate
fi
success "pnpm v$(pnpm --version) OK"

# ── 3. Verificar git ──────────────────────────────────────────────────────────
info "Verificando git..."
if ! command -v git &>/dev/null; then
  error "git no está instalado. Instálalo desde https://git-scm.com"
fi
success "git v$(git --version | awk '{print $3}') OK"

# ── 4. Clonar o actualizar el repositorio ────────────────────────────────────
if [ -d "$REPO_DIR/.git" ]; then
  info "Repositorio ya existe — actualizando desde origin/${BRANCH}..."
  cd "$REPO_DIR"

  # Guardar cambios locales si hay
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Hay cambios locales sin commitear — guardando en stash..."
    git stash push -m "sync-local.sh auto-stash $(date '+%Y-%m-%d %H:%M:%S')"
    STASHED=true
  else
    STASHED=false
  fi

  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
  success "Código actualizado a origin/${BRANCH} ($(git rev-parse --short HEAD))"

  if [ "$STASHED" = true ]; then
    warn "Tus cambios locales fueron guardados en git stash."
    warn "Para recuperarlos ejecuta: git stash pop"
  fi

elif [ -d "$REPO_DIR" ]; then
  error "Existe una carpeta '$REPO_DIR' pero no es un repositorio git. Elimínala o renómbrala y vuelve a ejecutar."

else
  info "Clonando repositorio..."
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
  success "Repositorio clonado ($(git rev-parse --short HEAD))"
fi

# ── 5. Instalar dependencias ──────────────────────────────────────────────────
info "Instalando dependencias (pnpm install)..."
pnpm install --frozen-lockfile
success "Dependencias instaladas"

# ── 6. Variables de entorno ───────────────────────────────────────────────────
ENV_FILE="apps/web/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  warn "No existe $ENV_FILE"
  if [ -f ".env.example" ]; then
    cp .env.example "$ENV_FILE"
    warn "Se creó $ENV_FILE desde .env.example"
    warn "IMPORTANTE: edita $ENV_FILE y completa los valores de Supabase antes de ejecutar pnpm dev"
  fi
else
  success "$ENV_FILE ya existe — no se modificó"
fi

# ── 7. Typecheck ──────────────────────────────────────────────────────────────
info "Verificando tipos (typecheck)..."
if pnpm typecheck 2>&1 | grep -q "error TS"; then
  warn "Hay errores de TypeScript — revisa con: pnpm typecheck"
else
  success "Typecheck OK"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Sincronización completa              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Rama:    ${CYAN}${BRANCH}${NC}"
echo -e "  Commit:  ${CYAN}$(git rev-parse --short HEAD)${NC}"
echo -e "  Carpeta: ${CYAN}$(pwd)${NC}"
echo ""
echo -e "  Para iniciar el servidor de desarrollo:"
echo -e "  ${YELLOW}pnpm dev${NC}"
echo ""
