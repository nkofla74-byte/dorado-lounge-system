# BOOTSTRAP.md — Sprint 0

> Manual de campo. Sigue el orden. No saltes pasos.
> **Plataforma:** Fedora 42 · **Modo:** desarrollo (producción no se cubre aquí).

---

## 0. Pre-requisitos

Cuentas necesarias (créalas antes de continuar):

- [ ] Anthropic con plan **Max** ($100/mes)
- [ ] GitHub
- [ ] Supabase
- [ ] Vercel
- [ ] Render
- [ ] Internet estable

---

## 1. Setup Fedora 42 — una sola vez (~15 min)

```bash
# Sistema al día
sudo dnf upgrade -y

# Toolchain (algunos paquetes npm compilan código nativo)
sudo dnf groupinstall "Development Tools" -y
sudo dnf install gcc-c++ make python3 git curl -y

# Node.js 22 LTS vía módulo Fedora
sudo dnf module reset nodejs -y
sudo dnf module enable nodejs:22 -y
sudo dnf install nodejs -y

# Configurar npm para evitar EACCES (sin sudo nunca)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# pnpm (gestor del monorepo)
npm install -g pnpm

# GitHub CLI
sudo dnf install gh -y
gh auth login

# Claude Code (instalador nativo, no requiere npm)
curl -fsSL https://claude.ai/install.sh | bash

# Verificación
node --version    # v22.x
pnpm --version
gh --version
claude doctor
```

Si `claude` no se encuentra después de instalar, reinicia la terminal o:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

---

## 2. Crear proyectos en la nube (~15 min, navegador)

### 2.1 GitHub
- Username confirmado, SSH key cargada (`gh auth status`).

### 2.2 Supabase
1. Dashboard → **New project**
2. Region: **South America (São Paulo)** o **East US** (más cerca de Bogotá)
3. Plan: **Free**
4. Anota: `Project ref`, `URL`, `anon key`, `service_role key` (ve a Settings → API)

### 2.3 Vercel
1. Login con GitHub
2. No crees proyecto todavía — lo conectas en paso 3.2

### 2.4 Render
1. Login con GitHub
2. No crees servicio todavía — el `render.yaml` lo creará Claude Code

---

## 3. Integraciones cloud (~10 min, navegador)

### 3.1 Supabase ↔ GitHub (branching)
> No actives esto todavía. El repo aún no existe. Lo harás al final del paso 4.

### 3.2 Vercel ↔ Supabase
> Lo conectas después de crear el proyecto en Vercel (Sprint 0, chunk 4).

---

## 4. Bootstrap del repo (~5 min)

```bash
mkdir -p ~/proyectos/dorado-lounge-system
cd ~/proyectos/dorado-lounge-system

git init
git branch -m main

# Coloca los archivos rectores en la raíz
cp ~/Descargas/CLAUDE.md .
cp ~/Descargas/ARCHITECTURE.md .

# .gitignore
cat > .gitignore <<'EOF'
node_modules/
.next/
dist/
build/
.env*
!.env.example
.DS_Store
*.log
.turbo/
.vercel/
playwright-report/
test-results/
coverage/
.pnpm-store/
*.tsbuildinfo
EOF

echo "# Dorado Lounge System" > README.md
mkdir -p docs/adr docs/runbooks docs/api supabase/migrations

# Copia este BOOTSTRAP.md al repo
cp ~/Descargas/BOOTSTRAP.md docs/

git add .
git commit -m "chore: bootstrap repo con CLAUDE.md, ARCHITECTURE.md y BOOTSTRAP.md"

# Crear repo privado y push inicial
gh repo create dorado-lounge-system --private --source=. --remote=origin --push
```

### 4.1 Activar Supabase ↔ GitHub (ahora sí)

Dashboard de Supabase → tu proyecto:
1. **Project Settings** → **Integrations** → **GitHub Integration** → **Authorize GitHub**
2. Repositorio: `dorado-lounge-system`
3. **Working directory**: `.`
4. **Project Settings** → **Branching** → **Enable branching**
5. Activa **Automatic branching**
6. Marca **Supabase changes only** (solo crea preview branch cuando cambian archivos en `supabase/`)

A partir de aquí: cada PR con cambios en `supabase/migrations/*.sql` genera una preview DB; cada merge a `main` aplica a producción.

---

## 5. Primer launch de Claude Code

```bash
cd ~/proyectos/dorado-lounge-system
claude
```

OAuth en navegador. Autoriza. Activa **Plan Mode** (`Shift+Tab`).

**Prompt inicial — copia exactamente:**

```
Lee CLAUDE.md, ARCHITECTURE.md y docs/BOOTSTRAP.md de este repo. Son el contrato 
operativo del proyecto. Confirma comprensión resumiendo en 5 bullets:
1. Stack y por qué
2. Principio rector inviolable
3. Topología de canales real-time
4. Decisiones cerradas que no debemos discutir
5. Los 3 hallazgos críticos del ARCHITECTURE.md más relevantes para codear

CONTEXTO OPERATIVO PARA TODA LA SESIÓN:
- Fedora 42, Node 22, pnpm, sin Docker, sin Supabase CLI local.
- Las migraciones SQL son archivos planos en supabase/migrations/.
- Se aplican vía la integración GitHub-Supabase (preview branch en PR, 
  producción al mergear a main).
- Vercel hace deploy preview por PR; Render lo mismo via render.yaml.
- En local solo correré: pnpm install, pnpm dev, pnpm test, pnpm lint, 
  git, claude.

NO empieces a hacer nada todavía. Solo confirma comprensión y este contexto.
```

Si Claude propone `supabase start`, Docker o Postgres local — recházalo y reitera el contexto.

---

## 6. Sprint 0 — los 4 chunks

> Usa `/clear` entre cada chunk. Cada uno es una sesión limpia.

### Chunk 1 — Monorepo + render.yaml

```
PLAN MODE.

Sprint 0, chunk 1. Crea el monorepo pnpm según ARCHITECTURE.md §7:

- apps/web (Next.js 14 App Router, TS strict, Tailwind, shadcn/ui base)
- apps/socket-server (Node + Socket.io + TS)
- packages/shared-types
- packages/shared-validation
- packages/eslint-config

Archivos raíz:
- pnpm-workspace.yaml
- package.json con scripts dev/build/test/lint orquestando paquetes
- render.yaml declarando socket-server como Web Service:
  · plan: free (es desarrollo)
  · buildCommand y startCommand correctos para pnpm en monorepo
  · healthCheckPath: /health
  · envVars marcados sync: false (los pongo yo)
- .env.example según ARCHITECTURE.md Apéndice B

NO hagas: tests extensos, configuración Supabase CLI, docker-compose, código
de dominio.

Muéstrame el plan completo antes de tocar archivos.
```

Al finalizar el chunk: `pnpm install` debe correr sin errores. Commit y push.

### Chunk 2 — Toolchain y CI

```
/clear

PLAN MODE.

Sprint 0, chunk 2. Cadena de calidad:

- ESLint con regla no-restricted-imports (ARCHITECTURE.md §16.2): 
  domain/application no pueden importar de infrastructure/ ni @supabase/*
- Prettier con config compartida en packages/eslint-config
- TypeScript strict en todos los paquetes (noUncheckedIndexedAccess, 
  noImplicitOverride, exactOptionalPropertyTypes)
- Vitest configurado donde aplique
- Husky + lint-staged + commitlint (Conventional Commits)
- GitHub Actions: .github/workflows/ci.yml con jobs lint, typecheck, test
  (sin pgtap ni e2e por ahora)

Plan completo antes de archivos.
```

Al finalizar: PR de prueba con un cambio trivial debe pasar el CI verde.

### Chunk 3 — Primera migración SQL

```
/clear

PLAN MODE.

Sprint 0, chunk 3. Crea supabase/migrations/0001_extensions_tenants_users.sql.

Contenido (ARCHITECTURE.md §8 y §11.4):
- Extensiones: pgcrypto (gen_random_uuid, digest)
- Tabla tenants (id, nombre, slug, created_at, deleted_at)
- Tabla users que extiende auth.users vía FK
- Función SECURITY DEFINER + trigger on_auth_user_created que pobla 
  custom claim 'tenant_id' en raw_app_meta_data
- RLS habilitada en tenants y users con políticas tenant_isolation

La migración debe ser:
- Idempotente (CREATE ... IF NOT EXISTS, CREATE OR REPLACE FUNCTION)
- Comentarios explicando cada bloque
- Bloque DROP final comentado (para rollback documentado)

Después del archivo, dame:
1. Pasos para aplicarla la primera vez vía SQL Editor del dashboard 
   (mientras el branching no está aún en flujo de PR)
2. Cómo verificar que las políticas RLS funcionan (test query)
```

Aplica la migración manualmente la primera vez. De ahí en adelante, las migraciones siguientes van por PR → preview → merge → prod.

### Chunk 4 — Deploys preview

```
/clear

PLAN MODE.

Sprint 0, chunk 4. Cierra Sprint 0 con deploys funcionando:

apps/web:
- Página /health que responde 200 OK
- Cliente Supabase configurado (lib/supabase/client.ts y server.ts) usando 
  env vars NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
- next.config.mjs con headers de seguridad básicos (§11.6)

apps/socket-server:
- Endpoint GET /health → 200 OK
- Servidor Socket.io vacío con auth middleware stub (acepta cualquier token 
  por ahora, marcado con TODO: implementar JWT verify en Sprint 1)
- Logger pino estructurado

Variables a documentar en .env.example, NO en código.

Después del chunk, dame las instrucciones para:
1. Crear el proyecto en Vercel apuntando a apps/web (root directory)
2. Conectar Vercel ↔ Supabase (integración) 
3. Crear el Blueprint en Render apuntando al render.yaml
4. Verificar que ambos deploys preview funcionan en una PR de prueba
```

Sigue las instrucciones que te dé Claude para conectar Vercel y Render. **No pongas claves de producción en tu Fedora** — todas viven en los dashboards.

---

## 7. Loop diario

```bash
cd ~/proyectos/dorado-lounge-system
git checkout main && git pull

# Nueva feature
git checkout -b feature/<nombre>

claude
# trabajas con Plan Mode activo

# Verificación local antes de push
pnpm lint
pnpm typecheck
pnpm test

git add . && git commit -m "feat: <descripción>"
git push -u origin feature/<nombre>

gh pr create --fill
# CI corre, Supabase crea preview branch, Vercel/Render crean preview deploys
# Revisas en preview, mergees, producción se actualiza sola
```

**Cuándo hacer `/clear` en Claude Code:**
- Al cambiar de bounded context (de inventory a real-time, etc.)
- Después de una sesión larga (>1h)
- Cuando notes que olvidó algo del CLAUDE.md → mejor `/clear` y readjuntar

**Cuándo NO usar Claude Code:**
- Aprobar una migración SQL sin leerla línea por línea
- Pegar valores reales de `.env` (siempre `.env.example`)
- Decisiones de negocio (las 12 preguntas abiertas de ARCHITECTURE.md §19)

---

## 8. Troubleshooting Fedora 42

### `EACCES: permission denied` con npm
No instalaste con prefix en home. Repite paso 1.

### `node-gyp` falla compilando paquete nativo
```bash
sudo dnf install gcc-c++ make python3-devel -y
pnpm rebuild
```

### `pnpm install` falla por SELinux denegando acceso a `node_modules`
Raro pero pasa con symlinks. Solución temporal:
```bash
sudo setenforce 0   # solo durante el install
pnpm install
sudo setenforce 1
```
Si recurre, configura un boolean específico — abre issue, no es bloqueante.

### Claude Code: `command not found: claude`
```bash
ls ~/.local/bin/claude   # verifica que está
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Vercel deploy falla: "Could not find Next.js in apps/web"
Settings del proyecto en Vercel → **Root Directory** → `apps/web`. **Build & Development Settings** → **Install Command** → `cd ../.. && pnpm install --frozen-lockfile`.

### Render deploy falla por pnpm
En `render.yaml`, el `buildCommand` debe incluir `corepack enable && corepack prepare pnpm@latest --activate` antes del `pnpm install`.

### Supabase preview branch sin migraciones
Verifica que el `Working directory` de la integración GitHub sea `.` y que los archivos estén en `supabase/migrations/` (no `supabase/migration/`).

---

## 9. Definition of Done — Sprint 0

Antes de cerrar Sprint 0 y arrancar Sprint 1, esto debe ser cierto:

- [ ] Repo privado en GitHub con CLAUDE.md, ARCHITECTURE.md, BOOTSTRAP.md en raíz
- [ ] `pnpm install` corre sin errores en Fedora
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` corren verdes
- [ ] CI de GitHub Actions corre en cada PR y pasa
- [ ] Migración 0001 aplicada en Supabase (verificable en Table Editor)
- [ ] RLS habilitada y verificada con query de prueba
- [ ] Vercel: PR de prueba genera deploy preview accesible con `/health` respondiendo 200
- [ ] Render: socket-server desplegado con `/health` respondiendo 200
- [ ] Supabase: PR con cambio en migración genera preview branch automática
- [ ] Husky bloquea commits que no pasan lint-staged
- [ ] Conventional Commits enforced

Cuando los 11 estén marcados: **Sprint 0 cerrado**. Avanzas a Sprint 1 (Identity + Tenant + RBAC + Audit log).

---

*v1.0 — Sprint 0, modo desarrollo · Fedora 42 · Próxima revisión al cierre de Sprint 0*
