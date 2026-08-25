# SKILLS_CONFIG — Configuración y precedencia

## 1. Cómo se cargan

Claude Code descubre automáticamente toda carpeta con `SKILL.md` bajo
`.claude/skills/` al abrir el proyecto. **No hay fichero de registro ni orden de
carga configurable**: el modelo ve solo el campo `description` de cada skill en
cada turno y decide cuál abrir. El cuerpo se lee bajo demanda.

Dos consecuencias prácticas:

- El coste permanente de contexto es la suma de las `description` (~7,1 KB con
  las 10 instaladas). Por eso se excluyó `apple-design-backend`.
- **La prioridad que pediste no se puede declarar en configuración.** Se
  implementa como contenido, en `dorado-design-system/SKILL.md`, que es el
  documento que fija el orden y resuelve los empates.

## 2. Orden de precedencia

| #   | Fuente                                          | Ámbito                                             |
| --- | ----------------------------------------------- | -------------------------------------------------- |
| 1   | `apple-hig-designer` + `apple-design`           | Principios HIG                                     |
| 2   | `apple-design-materials`                        | Liquid Glass, materiales, iconografía              |
| 3   | `apple-design-web` + `apple-design-foundations` | Color, tipografía, layout web                      |
| 4   | `apple-design-os`                               | Reglas por plataforma (solo referencia conceptual) |
| —   | **`dorado-design-system`**                      | **Gana sobre todas**                               |

## 3. Conflictos resueltos

| Conflicto                                         | Resolución                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Dos skills con `name: apple-design`               | Se descartó `dickwu/apple-design-skill` antes de instalar                                                                     |
| Las skills proponen SwiftUI; el proyecto es React | `dorado-design-system` §2 traduce cada primitiva                                                                              |
| **SF Symbols**                                    | Es una fuente con licencia de Apple: **no puede embeberse en una web**. Se mapea a `lucide-react`, ya presente en el proyecto |
| Colores del sistema de iOS vs. tokens shadcn      | Mandan las variables HSL de `globals.css`. Ningún hex suelto                                                                  |
| 44 pt de Apple vs. cocina con guantes             | En KDS y almacén el mínimo sube a **56 px**                                                                                   |
| Liquid Glass vs. legibilidad de datos operativos  | El cristal solo va en superficies flotantes, nunca tras cantidades, lotes o temporizadores                                    |

## 4. Interacción con las reglas del repositorio

`dorado-design-system` **no deroga** `CLAUDE.md`, que sigue siendo la autoridad.
En particular la regla 7 (nada de strings hardcodeados, todo por `next-intl`) y
la 13 (stack congelado: las skills **no** justifican meter framer-motion ni
cambiar de librería de componentes).

Precedencia efectiva: `CLAUDE.md` > `dorado-design-system` > skills `apple-*`.

## 5. Instalación global en tu máquina (opcional)

Lo anterior solo aplica dentro de este repositorio. Para tenerlas en todos tus
proyectos, en **tu** equipo:

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/s1gmamale1/apple-design-skills.git ~/src/apple-design-skills
cd ~/src/apple-design-skills && chmod +x install.sh && ./install.sh   # symlinks, no sobrescribe
```

El instalador enlaza en `~/.claude/skills` y `~/.agents/skills`; actualizas con
`git pull`. Revisado: no toca nada más y omite lo que ya existe.

Alternativa sin ejecutar scripts de terceros — equivalente y más conservadora:

```bash
cp -r ~/src/apple-design-skills/skills/apple-design-web ~/.claude/skills/
```

**`dorado-design-system` no debe instalarse globalmente**: asume este stack y
esta cocina. Fuera de este repositorio da consejos equivocados.

Reinicia Claude Code después de instalar; las skills se descubren al arrancar.

## 6. Verificar que están cargadas

```bash
find .claude/skills -name SKILL.md | wc -l    # esperado: 10
claude plugin details <nombre>                # inventario y coste en tokens
```

Dentro de una sesión, pídele a Claude que liste sus skills disponibles: deben
aparecer las diez.
