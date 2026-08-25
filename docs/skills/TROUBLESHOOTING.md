# TROUBLESHOOTING — Stack de skills de diseño

## 1. Validar la instalación

```bash
python3 - <<'PY'
import os, re, sys
root = ".claude/skills"; errs, names = [], {}
for d in sorted(os.listdir(root)):
    p = os.path.join(root, d)
    if not os.path.isdir(p): continue
    f = os.path.join(p, "SKILL.md")
    if not os.path.isfile(f): errs.append(f"{d}: falta SKILL.md"); continue
    txt = open(f, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m: errs.append(f"{d}: frontmatter ausente"); continue
    n = re.search(r"^name:\s*(.+)$", m.group(1), re.M)
    if not n: errs.append(f"{d}: sin 'name'"); continue
    n = n.group(1).strip().strip('"')
    if n != d: errs.append(f"{d}: name='{n}' no coincide con la carpeta")
    if n in names: errs.append(f"COLISIÓN '{n}': {names[n]} y {d}")
    names[n] = d
print("\n".join("✗ "+e for e in errs) if errs else f"✓ {len(names)} skills válidas")
sys.exit(1 if errs else 0)
PY
```

## 2. Síntomas y causas

### Claude ignora las skills

Causa casi siempre: **sesión iniciada antes de instalarlas**. Se descubren al
arrancar. Reinicia Claude Code.

Si persiste: la `description` es lo único que el modelo ve para decidir. Si tu
petición no se parece a sus palabras clave, no la abre. Invócala por nombre:
«usa la skill `dorado-design-system`».

### Claude propone SwiftUI, `UIColor` o SF Symbols

`dorado-design-system` no se cargó. Es el adaptador; sin él las demás hablan de
iOS nativo. Verifica que existe y pídela explícitamente.

**Nunca aceptes SF Symbols en esta aplicación**: es una fuente con licencia de
Apple, restringida a apps de sus plataformas. Embeberla en una web es una
infracción de licencia. El equivalente aquí es `lucide-react`.

### `name` duplicado / colisión

Dos `SKILL.md` con el mismo `name`. El comportamiento es indefinido: puede
cargarse la equivocada. Detectado por el script de §1. Sucede al añadir una
skill nueva sin comprobar: `dickwu/apple-design-skill` colisiona con
`apple-design` y por eso se descartó.

### El contexto se llena / respuestas lentas

Cada `description` viaja en **todos** los turnos (~7,1 KB con las diez). Si
añades más skills, mide antes:

```bash
find .claude/skills -name SKILL.md | while read f; do
  echo "$(awk '/^---$/{c++;next} c==1' "$f" | wc -c) $f"
done | sort -rn
```

Elimina las que no uses. `apple-design-backend` se excluyó por esto.

### La prueba de contrato HIG falla

```bash
pnpm --filter @dorado/web exec vitest run src/components/design
```

Está haciendo su trabajo: alguien rompió el contrato de diseño. Los fallos
típicos y su arreglo:

| Aserción que falla | Qué se rompió                      | Arreglo                                  |
| ------------------ | ---------------------------------- | ---------------------------------------- |
| objetivos táctiles | Un `min-h-` menor de 11            | Subir a `min-h-14` en KDS                |
| hex suelto         | Un color literal en el JSX         | Usar los tokens de `globals.css`         |
| reduced motion     | Falta `motion-reduce:`             | Añadir la contrapartida a cada animación |
| glass sin fallback | Falta `supports-[backdrop-filter]` | Añadir el fallback opaco                 |
| strings a mano     | Falta `useTranslations`            | Mover el texto a `messages/*.json`       |

**No relajes la aserción para que pase.** Es la única defensa automática del
contrato.

### El `backdrop-filter` va a tirones en el KDS

Esperado. Es caro y las colas se repintan con cada evento de Socket.io.
Aplícalo al contenedor, nunca a cada tarjeta. Si sigue mal, quita el cristal:
la legibilidad manda sobre el efecto.

### `git pull` trae conflictos en `.claude/skills`

Son ficheros vendorizados; no los edites en local. Ante un conflicto, quédate
con la versión entrante y reaplica tus cambios en `dorado-design-system`, que es
la única carpeta pensada para modificarse.

## 3. Límites conocidos

- **No hay skill oficial de Apple ni de Anthropic para HIG.** Todo es de
  terceros, con pocos meses de vida y pocas estrellas. Trátalo como referencia
  útil, no como norma verificada. Ante una duda real, la fuente es
  <https://developer.apple.com/design/human-interface-guidelines/>.
- Las skills describen el HIG **según sus autores**. Pueden contener errores o
  quedarse desfasadas respecto a lo que Apple publique.
- La prueba de validación es estática. **No sustituye** a probar con VoiceOver,
  con zoom al 200 % y en la tablet real de la cocina.
- Buena parte del contenido asume apps nativas. `apple-design-web` y
  `apple-design-foundations` son las de mayor rendimiento aquí.

## 4. Diagnóstico rápido

```bash
claude --version                                   # 2.1.240 al instalar
find .claude/skills -name SKILL.md | wc -l         # 10
du -sh .claude/skills                              # ~1,2 MB
pnpm --filter @dorado/web exec vitest run src/components/design
git log --oneline -- .claude/skills                # historial de la instalación
```
