# /nuevo-modulo

Crea un módulo nuevo siguiendo la arquitectura Hexagonal + DDD del proyecto.

## Uso

```
/nuevo-modulo <nombre>
```

## Instrucciones

El argumento `$ARGUMENTS` es el nombre del módulo en snake_case (ej: `chat`, `flights`, `notifications`).

1. **Verifica** que el módulo no existe ya en `apps/web/src/modules/`.

2. **Determina** en qué capa de bounded context encaja:
   - Core (no depende de nadie): si gestiona datos propios sin orquestar otros módulos
   - Supporting (orquesta Core): si coordina inventory/recipes/production
   - Generic: si es infraestructura transversal

3. **Crea** la siguiente estructura bajo `apps/web/src/modules/<nombre>/`:

```
domain/<nombre>.ts            ← tipos de dominio, value objects, eventos. Sin imports externos.
application/get-<nombre>.ts   ← caso de uso de lectura
application/create-<nombre>.ts ← caso de uso de mutación (si aplica)
application/ports/<nombre>-repository.port.ts  ← interface del repositorio
infrastructure/<nombre>-repository.ts          ← implementación con Supabase
actions.ts                    ← ÚNICA superficie pública. 'use server' + Zod + assertCan + auditLog
tests/<nombre>-domain.test.ts ← tests del dominio (Vitest)
```

4. **Reglas obligatorias al generar el código:**
   - `domain/`: cero imports de `@supabase/*` ni de `infrastructure/`
   - `actions.ts`: siempre empieza con `assertCan(perm)` y termina con `auditLog(...)`
   - `actions.ts` retorna `Result<T>` de `@/lib/result`
   - Toda tabla nueva lleva `tenant_id uuid NOT NULL` + RLS
   - Si el módulo emite eventos Socket.io, agregarlos a `packages/shared-types/src/socket-events.ts` primero

5. **Verifica** la lista de tablas en CLAUDE.md antes de crear tablas nuevas en DB. Si se necesita migración, crearla en `supabase/migrations/` con nombre `YYYYMMDDHHMMSS_<nombre>.sql` e idempotente.

6. **Al terminar**, muestra un resumen de los archivos creados y qué falta implementar en cada uno.
