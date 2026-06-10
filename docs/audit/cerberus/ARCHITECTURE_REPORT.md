# OPERACIÓN CERBERUS — AGENTE 01: Arquitectura + Código Muerto

**Proyecto:** Dorado Lounge (SaaS multi-tenant 24/7, sala VIP El Dorado)
**Rama:** `feature/refoco-operacional`
**Fecha auditoría:** 2026-05-30
**Scope:** Arquitectura, modularidad, deuda técnica, código muerto, residuos de módulos removidos.
**Método:** lectura + grep/glob + `pnpm lint`/`tsc --noEmit`/`pnpm test` (read-only).

---

## Resumen ejecutivo

El proyecto está en **muy buen estado arquitectónico**. La regla hexagonal (`domain → application → infrastructure → actions.ts`) se cumple de forma estricta y verificable: **0 violaciones** de `domain/application` importando `infrastructure/` o `@supabase/*`. Lint limpio, typecheck limpio, **311 tests pasan (28 archivos)**. La limpieza tras la remoción de módulos (snack/buffet/afluencia/chat-route/flights) fue mayormente correcta: no quedan imports rotos ni handlers de socket huérfanos.

El hallazgo de mayor peso **no es deuda heredada sino estado transitorio del refoco en curso**: las rutas del split de cocina (F1) `/cocina-fria` y `/cocina-caliente` existen como **stubs estáticos sin lógica KDS**, mientras la lógica real sigue solo en la ruta legacy `/cocina`. Es esperado dado el sprint, pero es la pieza incompleta más importante y debe rastrearse para no quedar como deuda.

Código muerto detectado: mínimo y de bajo riesgo (1 directorio de ruta vacío, scripts duplicados/huérfanos, drift de documentación).

### Verificación (evidencia base)

| Comando                                        | Resultado                      |
| ---------------------------------------------- | ------------------------------ |
| `pnpm --filter web lint`                       | ✔ No ESLint warnings or errors |
| `pnpm --filter web exec tsc --noEmit`          | EXIT 0                         |
| `pnpm test`                                    | 311 passed (28 files), 14.4s   |
| grep cross-layer (domain/app → infra/supabase) | 0 coincidencias                |

---

## Hallazgos

### H-01 · Rutas del split de cocina (F1) son stubs sin funcionalidad KDS

- **Severidad:** ALTO (en contexto de refoco; sería CRÍTICO si se considerara "terminado")
- **Tipo:** Funcionalidad incompleta / acoplamiento de la lógica al route legacy
- **Evidencia:**
  - `apps/web/src/app/(dashboard)/cocina-fria/page.tsx:16-24` — renderiza solo un placeholder `border-dashed` con `{t('sinSolicitudes')}`. No hace `getPedidos()`, no monta `KdsBoard`, no se suscribe a Socket.io.
  - `apps/web/src/app/(dashboard)/cocina-caliente/page.tsx:22-23` — idéntico stub estático.
  - `apps/web/src/app/(dashboard)/cocina/page.tsx:1-20` — única ruta con KDS real: `getPedidos()` + `<KdsBoard>`.
  - `apps/web/src/components/kds/kds-board.tsx` — `grep -E "cocina_caliente|cocina_fria|area"` → **0 coincidencias**: el board legacy no filtra por área productiva.
- **Impacto:** El ruteo automático a KDS (R1-R3) ya escribe `area` por producto (`modules/orders/domain/routing.ts`, `ZONA_AREAS_PERMITIDAS` en `packages/shared-types/src/enums.ts:85`), pero **las pantallas que deberían consumir cada cola (fría/caliente) no muestran nada**. Los roles `chef_cocina_fria` / `chef_cocina_caliente` (que existen y tienen home a esas rutas, `lib/auth/role-home.ts:7-8`) no tienen UI operativa. Toda la operación de cocina sigue dependiendo del board legacy combinado.
- **Probabilidad:** Confirmado (HECHO).
- **Solución recomendada:** Cablear `KdsBoard` (o variante) en ambas rutas con filtro por `area`; el board debe leer el campo de área del pedido/ítem y suscribirse a `sala:cocina:fria` / `sala:cocina:caliente` (canales ya definidos en `socket-events.ts:9-10`). Definir si `/cocina` legacy se deprecia tras el split o permanece como vista admin agregada.

### H-02 · Componente gigante `qr-passenger-app.tsx` con i18n hardcodeado (viola regla CLAUDE.md)

- **Severidad:** MEDIO
- **Tipo:** God-component + violación de regla de i18n + duplicación de sistema de traducción
- **Evidencia:**
  - `apps/web/src/components/qr/qr-passenger-app.tsx` — **1379 líneas** (el archivo más grande del repo, ~2.2× el siguiente).
  - Líneas `42-288`: objeto `const TEXTS: Record<string, Record<string, string>>` con ~247 líneas de strings hardcodeados en 4 locales (es/en/fr/pt).
  - `grep -c "useTranslations"` → **0**; `grep -c "TEXTS["` → 4 (el componente NO usa next-intl, usa su propio diccionario).
  - 5+ subcomponentes en el mismo archivo: `DoradoLogo` (305), `DishCard` (342), `MenuScreen` (526), `QRPassengerApp` (837), `HubButton` (1324), `HubCard` (1353).
- **Impacto:** CLAUDE.md (Patrones · i18n) ordena "nunca hardcodear strings de UI". Aquí hay un segundo sistema de i18n paralelo a next-intl, no rastreable por las claves de `messages/{es,en}.json`, y como `messages/` solo tiene es/en mientras QR exige es/en/fr/pt, hay incentivo a que el patrón se replique. El tamaño dificulta mantenimiento, testing y code-review.
- **Probabilidad:** Confirmado (HECHO). _Hipótesis_ sobre la causa: el workaround nació porque next-intl del proyecto cubre solo 2 de los 4 locales del QR.
- **Solución recomendada:** Extraer `TEXTS` a `messages/qr.{es,en,fr,pt}.json` (o ampliar la cobertura de locales de QR en next-intl) y partir el archivo en `qr/*` (DishCard, MenuScreen, Hub\*, logo) como módulos separados. Objetivo: < 300 líneas por archivo.

### H-03 · Directorio de ruta vacío `/(dashboard)/turnos` (CÓDIGO MUERTO)

- **Severidad:** BAJO
- **Tipo:** Ruta abandonada / directorio huérfano
- **Evidencia:**
  - `find apps/web/src/app -type d -empty` → **única coincidencia:** `apps/web/src/app/(dashboard)/turnos`.
  - No existe `turnos/page.tsx` (verificado: `MISS turnos` en el chequeo de páginas). El módulo `modules/turnos/` sí existe y se usa (analytics, layout), pero **no hay ruta de UI** y `ROLE_HOME` no apunta a `/turnos`.
- **Impacto:** Bajo. Carpeta vacía que ensucia el árbol de rutas y puede confundir (sugiere una vista que no existe). Next.js no genera ruta sin `page.tsx`, así que no hay endpoint colgante real.
- **Probabilidad:** Confirmado (HECHO).
- **Solución recomendada:** Eliminar el directorio vacío, o crear la página de turnos si está planificada. (NOTA: cambio fuera de mi scope de escritura — solo recomendación.)

### H-04 · Scripts duplicados/huérfanos en `scripts/`

- **Severidad:** BAJO
- **Tipo:** Código muerto / duplicación
- **Evidencia (referencias buscadas en `package.json`, `.github/`, `render.yaml`, docs):**
  - `scripts/fix-app-metadata.mjs` — **0 referencias en todo el repo** (ni package.json, ni CI, ni docs). Huérfano.
  - `scripts/reset-users.mjs` y `scripts/reset-users.sql` — referenciados **solo en reportes** (`SECURITY_HARDENING.md`, `FIX_REPORT.md`, `enterpriseaudit20260527.md`), **no** en `package.json`. El canónico per CLAUDE.md es `reset-test-users.mjs` (`package.json:15` → `reset:test-users`). Duplicados superseded.
  - `scripts/seed-test-users.mjs` SÍ está cableado (`package.json:14`). `ci-backup.py`/`ci-migrate.py` SÍ en `.github/workflows/`. `setup-github-secrets.sh` se autorreferencia + audit doc.
- **Impacto:** Bajo. Confusión sobre cuál es el script vigente de reset de usuarios; riesgo de ejecutar el obsoleto contra prod.
- **Probabilidad:** `fix-app-metadata.mjs` huérfano = HECHO. `reset-users.*` obsoletos = ALTA probabilidad (HIPÓTESIS: superseded por `reset-test-users.mjs`, confirmar con el dueño antes de borrar).
- **Solución recomendada:** Confirmar y eliminar `fix-app-metadata.mjs`, `reset-users.mjs`, `reset-users.sql`; o documentar su propósito si son herramientas manuales puntuales.

### H-05 · Drift de documentación: CLAUDE.md describe roles, módulos y archivos inexistentes

- **Severidad:** BAJO (riesgo de inducir a error a agentes/desarrolladores)
- **Tipo:** Deuda de documentación (no de código)
- **Evidencia:**
  - `packages/shared-types/src/enums.ts:1-12` — `UserRole` tiene **10 roles**; faltan `recepcion`, `personal_snack`, `personal_buffet` que CLAUDE.md ("UIs por Rol") aún lista. Removidos con sus módulos. Consistente en código (`role-home.ts:3-14` cubre exactamente los 10), pero la doc miente.
  - CLAUDE.md menciona `lib/socket/use-realtime.ts`; el archivo real es `apps/web/src/lib/socket/use-socket.ts` (`grep use-realtime` → 0). Renombrado, doc no actualizada.
  - CLAUDE.md "Módulos existentes" lista `buffet`, `snack`, `afluencia`, `flights` como ✅; no existen como `modules/` (removidos). `chat` sí existe y está vivo (montado en `(dashboard)/layout.tsx:7,101`).
- **Impacto:** CLAUDE.md es autoritativo para los agentes; describir 13 roles cuando hay 10 y módulos que ya no existen puede inducir features mal dirigidas.
- **Probabilidad:** Confirmado (HECHO).
- **Solución recomendada:** Actualizar CLAUDE.md (tabla de roles, lista de módulos, ruta de `use-socket.ts`) para reflejar el post-refoco. Cambio de doc, fuera de mi scope de escritura.

### H-06 · Duplicación del tipo literal de zona `'amex' | 'snack' | 'buffet'`

- **Severidad:** BAJO
- **Tipo:** Duplicación / no usar la fuente de verdad
- **Evidencia (el literal se re-declara en ~7 componentes en vez de importar `ZonaServicio` de shared-types):**
  - `components/recipes/recipe-table.tsx:34`, `components/recipes/create-recipe-dialog.tsx:46-47`
  - `components/orders/pedido-table.tsx:156`, `components/orders/create-pedido-dialog.tsx:44`
  - `components/production/create-tanda-dialog.tsx:160`, `components/production/produccion-dashboard.tsx:12,54`
  - `components/kds/kds-board.tsx:13,47,90`, `components/kds/pedido-card.tsx:12`
  - Fuente de verdad disponible: `packages/shared-types/src/enums.ts:73-79` (`ZonaServicio`).
- **Impacto:** Bajo hoy, pero si se agrega/quita una zona (el refoco ya removió módulos snack/buffet) hay 7+ sitios a editar a mano sin que TS los enlace. Riesgo de divergencia silenciosa.
- **Probabilidad:** Confirmado (HECHO).
- **Solución recomendada:** Reemplazar los literales por `ZonaServicio` (tipo) y derivar las listas de `Object.values(ZonaServicio)`.

---

## Observaciones positivas (confirmadas, no son hallazgos)

- **Frontera hexagonal sólida.** `grep` de `domain/`+`application/` importando `infrastructure/` o `@supabase/*` → 0. La regla ESLint (`apps/web/.eslintrc.json:4-18` + overrides 20-44) está activa y el lint pasa.
- **`actions.ts` como única superficie pública respetada.** Los componentes que importan de `modules/*/domain/` lo hacen **solo con `import type`** (tipos de dominio), no lógica — patrón aceptable que no rompe la frontera.
- **Limpieza de módulos removidos correcta.** Sin imports rotos a snack/buffet/afluencia/flights/vuelos; socket-server sin handlers huérfanos (`grep` en `apps/socket-server/src` → 0). Las coincidencias residuales son comentarios o el uso legítimo de `snack`/`buffet` como `ZonaServicio` de consumo (siguen vivas como destinos de ruteo).
- **`CHANNELS`/`CHANNEL_ACL` actualizados al split F1** (`socket-events.ts:7-49`): canales `cocina:fria`/`cocina:caliente` y roles nuevos presentes y coherentes.
- **Deuda técnica de bajo nivel mínima:** 0 `@ts-ignore`/`@ts-expect-error`, ~9 `as any` (fuera de tests), 6 `eslint-disable`, **0 TODO/FIXME/HACK reales** (todas las coincidencias eran la palabra española "TODOS").
- **`orders/actions.ts` (583 líneas, 12 acciones)** es grande pero cohesivo (un solo agregado Pedido con su máquina de estados); no se considera god-file.

---

## Código muerto — inventario consolidado

| Item                                 | Ubicación                                            | Estado                                           | Acción sugerida      |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------ | -------------------- |
| Directorio de ruta vacío             | `apps/web/src/app/(dashboard)/turnos/`               | HECHO: vacío, sin `page.tsx`                     | Borrar o implementar |
| Script huérfano                      | `scripts/fix-app-metadata.mjs`                       | HECHO: 0 referencias                             | Borrar/confirmar     |
| Scripts superseded                   | `scripts/reset-users.mjs`, `scripts/reset-users.sql` | HIPÓTESIS: superseded por `reset-test-users.mjs` | Confirmar y borrar   |
| i18n paralelo                        | `qr-passenger-app.tsx:42-288` (`TEXTS`)              | HECHO: duplica next-intl                         | Migrar a messages/   |
| Rutas stub (no muertas, incompletas) | `cocina-fria/page.tsx`, `cocina-caliente/page.tsx`   | HECHO: placeholders sin KDS                      | Cablear KDS          |

No se detectaron: endpoints API abandonados (`/api/{cron,gdpr,heartbeat}` todos vivos), exports muertos masivos, ni residuos de imports de módulos removidos.

---

## Score de Arquitectura + Mantenibilidad: **82 / 100**

**Justificación:**

Base alta por fundamentos sólidos:

- Frontera hexagonal enforced y verificada (0 violaciones) — el activo arquitectónico más valioso. (+)
- Lint/typecheck/test verdes; 311 tests; deuda micro casi nula (0 ts-ignore, 0 TODO real). (+)
- Limpieza de módulos removidos bien ejecutada; contratos socket actualizados al split. (+)
- Multi-tenancy en Postgres/RLS (no auditado a fondo aquí, pero la separación está respetada en el código). (+)

Penalizaciones:

- **−10** H-01: el split de cocina (F1/R1-R3) tiene el ruteo backend hecho pero las **UIs consumidoras son stubs vacíos** — funcionalidad central incompleta y lógica aún acoplada al route legacy. (Es estado de sprint, pero pesa en mantenibilidad/operación real.)
- **−5** H-02: god-component de 1379 líneas con i18n hardcodeado que **viola una regla explícita** de CLAUDE.md y crea un sistema de traducción paralelo.
- **−3** H-03/H-04/H-06: código muerto menor (ruta vacía, scripts huérfanos/duplicados) + duplicación de tipo de zona en 7 sitios.

(El drift de doc H-05 no penaliza el score de _código_, pero se reporta por su efecto sobre agentes.)

**Veredicto:** arquitectura saludable y disciplinada; el grueso del riesgo no es deuda podrida sino **trabajo del refoco a medio cablear** (H-01) que debe cerrarse antes de declararlo terminado.
