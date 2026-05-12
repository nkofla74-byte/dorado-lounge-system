# /check-arch

Audita las reglas arquitectónicas del proyecto en el código actual. Detecta violaciones antes de que el linter las bloquee.

## Instrucciones

Revisa los bounded contexts en `apps/web/src/modules/` y verifica las siguientes reglas. Reporta PASS o FAIL para cada una.

### Regla 1 — Dependencias en capas

Para cada módulo, verifica que:

- `domain/*.ts` → no importa de `infrastructure/`, ni de `@supabase/*`, ni de otros módulos
- `application/*.ts` → no importa de `infrastructure/`
- Solo `actions.ts` puede importar de `infrastructure/`

Comando útil:

```bash
grep -r "from.*infrastructure" apps/web/src/modules/*/domain/ apps/web/src/modules/*/application/ 2>/dev/null
grep -r "@supabase" apps/web/src/modules/*/domain/ apps/web/src/modules/*/application/ 2>/dev/null
```

### Regla 2 — Surface pública de módulos

Código fuera de un módulo solo puede importar de `actions.ts`, nunca de `domain/`, `application/` o `infrastructure/` directamente:

```bash
grep -r "from.*modules/.*/domain\|from.*modules/.*/application\|from.*modules/.*/infrastructure" apps/web/src/app/ apps/web/src/components/ 2>/dev/null
```

### Regla 3 — Server Actions completas

Toda función en `actions.ts` debe tener `assertCan` y `auditLog`:

```bash
grep -L "assertCan\|auditLog" apps/web/src/modules/*/actions.ts 2>/dev/null
```

### Regla 4 — Descuentos de inventario

Ningún archivo TypeScript fuera de `fn_descontar_insumo_fefo` debería reimplementar lógica FEFO:

```bash
grep -r "FOR UPDATE\|fefo\|lotes.*order.*vencimiento" apps/web/src/ apps/socket-server/src/ 2>/dev/null
```

### Regla 5 — Tipos compartidos

Verifica que los eventos Socket.io usados en `apps/web` y `apps/socket-server` estén definidos en `packages/shared-types/src/socket-events.ts`:

```bash
grep -r "socket.emit\|socket.on" apps/web/src/lib/socket/ apps/socket-server/src/ 2>/dev/null | head -20
```

### Reporte final

Genera una tabla:

| Regla                 | Estado | Archivos con violación |
| --------------------- | ------ | ---------------------- |
| Dependencias en capas | ✅/❌  | —                      |
| Surface pública       | ✅/❌  | —                      |
| Actions completas     | ✅/❌  | —                      |
| No FEFO en TypeScript | ✅/❌  | —                      |
| Tipos en shared-types | ✅/❌  | —                      |

Si hay violaciones, explica brevemente cómo corregir cada una.
