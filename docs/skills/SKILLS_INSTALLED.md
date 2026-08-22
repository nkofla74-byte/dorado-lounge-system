# SKILLS_INSTALLED — Stack de diseño Apple HIG

Instalación ejecutada el **2026-08-22** sobre `dorado-lounge-system`, rama
`claude/forensic-repository-audit-bzupi6`.

## Entorno detectado (Fase 1)

| Dato                       | Valor                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SO                         | Ubuntu 24.04.4 LTS (contenedor efímero, `x86_64`)                                                                           |
| Claude Code                | **2.1.240**                                                                                                                 |
| Binario                    | `/opt/node22/bin/claude`                                                                                                    |
| Gestor de skills           | `claude plugin` (subcomandos `details`, `enable`, `disable`, `eval`)                                                        |
| Node / pnpm / git          | v22.22.2 / 10.33.2 / 2.43.0                                                                                                 |
| Skills globales previas    | `session-start-hook` + sincronizadas de cuenta (`docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`, `morning`, `import-memory`) |
| Skills de proyecto previas | ninguna (solo `.claude/commands/`)                                                                                          |

```bash
uname -a; cat /etc/os-release
which claude; claude --version
claude plugin --help
ls -la "$HOME/.claude/skills" "$HOME/.claude/plugins"
```

## Decisión de alcance: por qué en el proyecto y no en `~/.claude`

El contenedor donde corre esta sesión **se recicla**. Una instalación en
`~/.claude/skills` habría desaparecido al cerrar la sesión y nunca habría
llegado a tu máquina. Las skills se instalan en `.claude/skills/` del
repositorio: viajan por git, aparecen con un `git pull` y las hereda cualquiera
que clone. Para instalarlas además de forma global en tu equipo, ver
`SKILLS_CONFIG.md` §5.

## Fase 2 — Verificación de lo solicitado

**Cuatro de las seis skills pedidas no existen con ese nombre o ese autor.** Lo
verificado, una por una:

| #   | Pedida                                     | Resultado                                                                                       | Sustituto instalado                                                        |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `apple-design-skill` (NutshellEngineering) | ❌ Ese autor no existe. Sí existen `chaos-xxl/apple-design-skill` y `dickwu/apple-design-skill` | `apple-design` (hub de la familia s1gmamale1)                              |
| 2   | `apple-hig` (ebuntario)                    | ❌ No encontrado. Equivalente: `Ksanbal/apple-hig-codex-skill`                                  | `apple-hig-designer`                                                       |
| 3   | Apple HIG Designer                         | ✅ Existe                                                                                       | `apple-hig-designer` (tristan-mcinnis)                                     |
| 4   | `hig-platforms`                            | ❌ No existe como repositorio                                                                   | `apple-design-os`                                                          |
| 5   | `apple-ui-designer`                        | ❌ No existe con ese nombre                                                                     | `apple-design` + `apple-design-web`                                        |
| 6   | Liquid Glass                               | ⚠️ No hay repo dedicado; es una sección dentro de otras                                         | `apple-design-materials` + `apple-hig-designer/references/liquid-glass.md` |

**No existe ninguna skill oficial de Apple ni de Anthropic para HIG.** Todo lo
disponible es de terceros. Los repositorios candidatos tienen entre 1 y 7
estrellas y pocos meses de vida: se auditaron antes de instalar y ninguno se
instaló a ciegas.

### Auditoría de seguridad previa

```bash
git clone --depth 1 https://github.com/<owner>/<repo>.git   # a un sandbox, no al repo
grep -rniE "ignore (previous|all) instruction|exfiltrat|curl .*\|.*sh|process\.env|~/\.ssh|base64 -d" --include='*.md' .
find . -type f \( -name '*.sh' -o -name '*.ps1' -o -name '*.py' \)
```

Resultado: **sin hallazgos**. Todas las coincidencias eran la expresión «design
token». Los dos instaladores `.sh` encontrados solo crean symlinks o copian
ficheros, y omiten lo que ya existe (no sobrescriben). No se ejecutó ninguno:
la instalación se hizo copiando de forma explícita.

### Descartadas, con motivo

| Repositorio                                      | Motivo                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dickwu/apple-design-skill`                      | **Sin fichero LICENSE** → no es redistribuible dentro de este repo. Además su `name: apple-design` **colisiona** con el hub de la familia instalada |
| `Ksanbal/apple-hig-codex-skill`                  | CC-BY-4.0 (exige atribución) y redundante con las dos fuentes MIT ya incluidas. Tres skills de HIG solapadas gastan contexto sin aportar            |
| `apple-design-backend` (de la familia instalada) | Describe la CDN e infraestructura de Apple. Sin relación con este proyecto; costaba 795 bytes de contexto en cada turno                             |

## Fase 3 — Lo instalado

Ruta: `.claude/skills/` · Peso: **1,2 MB** · Total: **10 skills**

| Skill                      | Origen                                        | Licencia    | Commit    |
| -------------------------- | --------------------------------------------- | ----------- | --------- |
| `apple-design` (hub)       | s1gmamale1/apple-design-skills                | MIT         | `8a3fbea` |
| `apple-design-foundations` | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-materials`   | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-motion`      | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-os`          | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-web`         | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-interaction` | ídem                                          | MIT         | `8a3fbea` |
| `apple-design-tactics`     | ídem                                          | MIT         | `8a3fbea` |
| `apple-hig-designer`       | tristan-mcinnis/apple-hig-designer-skill-2026 | MIT         | `c26b580` |
| `dorado-design-system`     | **Propia**                                    | Propietaria | —         |

Se vendoriza (copia) en lugar de usar submódulos para que el repositorio sea
reproducible sin red y sobreviva a que un upstream se borre. La licencia MIT
original se conserva en `LICENSE.upstream` dentro de cada carpeta, como exige.

## Fase 5 — Validación

```bash
# Estructura: frontmatter, unicidad de nombres, coherencia carpeta/nombre
python3 <<'PY' ... (ver TROUBLESHOOTING.md §1)
# Prueba funcional
pnpm --filter @dorado/web exec vitest run src/components/design
pnpm lint && pnpm typecheck && pnpm test
```

| Comprobación                                                | Resultado                     |
| ----------------------------------------------------------- | ----------------------------- |
| 10 skills con frontmatter válido y nombre único             | ✅                            |
| Implementación de referencia (`kds-order-card.tsx`) compila | ✅                            |
| Contrato HIG — 10 aserciones                                | ✅ 10/10                      |
| Verificación por mutación del propio test                   | ✅ 3/3 regresiones detectadas |
| Suite completa                                              | ✅ 527 pruebas                |

La prueba es **estática sobre el código fuente**: comprueba que la
implementación cumple el contrato de diseño. No renderiza el componente ni
sustituye a una auditoría de accesibilidad con lector de pantalla real.

## Actualizar en el futuro

```bash
cd /tmp && git clone --depth 1 https://github.com/s1gmamale1/apple-design-skills.git
diff -r apple-design-skills/skills/apple-design-web \
        <repo>/.claude/skills/apple-design-web        # revisar ANTES de copiar
cp -r apple-design-skills/skills/<skill>/. <repo>/.claude/skills/<skill>/
pnpm --filter @dorado/web exec vitest run src/components/design   # revalidar
git add .claude/skills && git commit -m "chore(skills): actualizar <skill> a <commit>"
```

Actualizar **una skill por commit** y releer el diff: son instrucciones que
Claude va a obedecer. Un upstream comprometido es un vector de ejecución.

## Desinstalar

```bash
rm -rf .claude/skills/<nombre>                       # una skill
rm -rf .claude/skills                                # todas
rm -rf apps/web/src/components/design                # la prueba de validación
git add -A && git commit -m "chore(skills): desinstalar <nombre>"
```

Quitar `dorado-design-system` deja las demás sin adaptación al stack: volverán
a proponer SwiftUI y SF Symbols. Si se quita una, quitar todas.
