# SKILLS_BACKUP — Respaldo y restauración

Respaldo tomado **antes** de cualquier modificación, el 2026-08-22.

## Qué se respaldó

| Artefacto                                 | Contenido                          | SHA-256                             |
| ----------------------------------------- | ---------------------------------- | ----------------------------------- |
| `claude-config-20260822T192828Z.tar.gz`   | `~/.claude` sin transcripciones    | `11d96cf43f2b3916c846288ce71da7f0…` |
| `proyecto-claude-20260822T192828Z.tar.gz` | `.claude/` del repositorio         | `72df4ecea8965ced11599d1c4e08cb6e…` |
| `inventario-previo.txt`                   | Skills presentes antes de instalar | —                                   |

```bash
tar -czf claude-config-$STAMP.tar.gz \
  --exclude='projects' --exclude='sessions' --exclude='shell-snapshots' --exclude='session-env' \
  -C "$HOME" .claude
tar -czf proyecto-claude-$STAMP.tar.gz -C /home/user/dorado-lounge-system .claude
sha256sum *.tar.gz
```

Se excluyeron `projects/`, `sessions/` y `shell-snapshots/`: son
transcripciones de conversaciones, no configuración. Abultan y contienen datos
de sesión que no deben copiarse sin motivo.

## Dónde está

```
/tmp/claude-0/-home-user-dorado-lounge-system/19a9309d-67a3-58cf-8ef7-5d699ce0cf04/scratchpad/skills-backup
```

**Advertencia:** ese directorio vive en el contenedor efímero de esta sesión y
**se pierde al reciclarse**. No se subió al repositorio a propósito: el respaldo
incluye `launcher-settings.json`, que puede contener credenciales. Nunca lo
commitees.

## El respaldo real es git

Para lo que importa —el estado del repositorio— el respaldo verdadero es el
historial:

| Commit    | Estado                                              |
| --------- | --------------------------------------------------- |
| `d6ded14` | Antes de todo (previo incluso al arreglo del login) |
| `ea47d2c` | Instalación de las 10 skills                        |
| `44ee4a7` | Prueba de validación                                |

## Restaurar

Estado del repositorio anterior a las skills:

```bash
git revert --no-commit 44ee4a7 ea47d2c && git commit -m "revert: desinstalar stack de skills"
# o, si aún no se ha compartido la rama:
git reset --hard d6ded14
```

Solo las skills, conservando el resto:

```bash
rm -rf .claude/skills && git add -A && git commit -m "chore(skills): desinstalar stack"
```

Configuración global desde el tarball (solo dentro de esta sesión):

```bash
tar -xzf /tmp/claude-0/-home-user-dorado-lounge-system/19a9309d-67a3-58cf-8ef7-5d699ce0cf04/scratchpad/skills-backup/claude-config-20260822T192828Z.tar.gz -C "$HOME"
```

## Qué NO se tocó

- `~/.claude/skills/synced/` — skills de tu cuenta (`docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`, `morning`, `import-memory`). Intactas.
- `~/.claude/settings.json`, hooks y `launcher-settings.json`. Sin modificar.
- `.claude/commands/` del proyecto — los cuatro comandos existentes. Sin modificar.

La instalación **solo añadió** ficheros nuevos bajo `.claude/skills/`,
`apps/web/src/components/design/` y `docs/skills/`, más un bloque
`higValidacion` en los dos ficheros de mensajes. No se sobrescribió nada.
