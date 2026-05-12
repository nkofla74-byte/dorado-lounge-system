# /pre-push

Verifica la calidad del código antes de hacer push. Equivale al pipeline CI local.

## Instrucciones

Ejecuta los siguientes pasos en orden. Si alguno falla, detente y muestra el error antes de continuar.

1. **Format check**

   ```bash
   pnpm format:check
   ```

   Si falla: ejecuta `pnpm format:write` (o `prettier --write .`) y muestra los archivos modificados.

2. **Lint**

   ```bash
   pnpm lint
   ```

   Si falla: muestra los errores y corrígelos. Nunca usar `// eslint-disable` sin justificación.

3. **Typecheck**

   ```bash
   pnpm typecheck
   ```

   Si falla: muestra los errores de tipos y corrígelos.

4. **Tests unitarios**

   ```bash
   pnpm test
   ```

   Si falla: muestra qué tests fallaron. Si es `merma.test.ts`, es BLOQUEANTE — no continuar hasta resolverlo.

5. **Resumen final**

   Muestra una tabla con el resultado de cada paso:
   | Check | Estado |
   |---|---|
   | Format | ✅ / ❌ |
   | Lint | ✅ / ❌ |
   | Typecheck | ✅ / ❌ |
   | Tests | ✅ / ❌ |

   Si todo pasa: "Listo para push. Recuerda: commits en español con Conventional Commits."
   Si alguno falla: "NO hacer push hasta resolver los errores anteriores."
