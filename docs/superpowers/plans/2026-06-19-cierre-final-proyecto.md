# Cierre Final del Proyecto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar Dorado Lounge a producción "al 100%": cerrar el agujero de seguridad crítico vivo en prod, consolidar las ramas en vuelo, endurecer multi-tenant, cubrir el núcleo con tests reales, y vaciar el backlog de deuda técnica.

**Architecture:** Trabajo por fases con dependencias estrictas. Cada fase produce software funcional y testeable por sí sola, se mergea a `main` por PR con CI verde, y (cuando aplica) aplica migraciones a prod vía `supabase db push` en CI. Se respeta el patrón hexagonal (`domain → application → infrastructure → actions.ts`), el Principio Rector (nada sale sin receta, FEFO solo en SQL), y multi-tenancy en Postgres (RLS).

**Tech Stack:** Next.js 15 · TypeScript strict · Supabase (PG15 + RLS) · Socket.io · Vitest · Playwright · pnpm monorepo.

**Estado base verificado (2026-06-19):**

- `main` @ `4d666ec`. Tests verdes: 455 (web 346 · shared-types 45 · shared-validation 45 · socket 19). Lint + typecheck 0.
- **VULN CRÍTICA VIVA EN PROD:** `fn_descontar_insumo_fefo(...,p_tipo tipo_movimiento,...)` (oid 20166) tiene `EXECUTE` para `anon` y `authenticated`. Toma `p_tenant_id` del caller → manipulación de inventario cross-tenant vía PostgREST, saltándose `assertCan`. Fix listo en rama `fix/auditoria-seguridad-2026-06-15` (`20260615000000_fix_fefo_overload_security.sql`).
- Ramas sin mergear: `fix/auditoria-seguridad-2026-06-15` (7 ahead/0 behind — security + chat removal + heartbeat + order recall), `feat/unificar-almacen-inventario` (PR #25, CI verde), `chore/test-users-emails-descriptivos` (2 ahead — solapado con #25), `feature/kds-flujo-item` (solo docs ya mergeados — stale), `chore/limpieza-docs` (esta rama, 2 commits de docs).

> **Nota sobre citas de código heredadas:** varias referencias `file:line` de la memoria (C-19 `cantidadNeta`, A-06 `createAdminClient`, socket ACL) NO se encontraron por grep el 2026-06-19 → están obsoletas. Las tareas que las tocan empiezan SIEMPRE con un paso de "verificar estado actual" antes de cambiar nada.

---

## Fase 1 — Hotfix de seguridad FEFO (CRÍTICO, aislado, mergear primero)

**Objetivo:** Cerrar el `EXECUTE` público sobre la RPC de descuento de inventario SIN arrastrar el resto de la rama de seguridad (que solapa con PR #25). Migración aislada = cero conflicto, aplica a prod hoy.

**Files:**

- Create branch: `hotfix/fefo-overload-security` (desde `main`)
- Add: `supabase/migrations/20260615000000_fix_fefo_overload_security.sql` (extraído de `fix/auditoria-seguridad-2026-06-15`)

- [ ] **Step 1: Crear rama de hotfix desde main actualizado**

```bash
git fetch origin && git checkout main && git pull --ff-only origin main
git checkout -b hotfix/fefo-overload-security
```

- [ ] **Step 2: Traer SOLO la migración de seguridad desde la rama**

```bash
git checkout fix/auditoria-seguridad-2026-06-15 -- supabase/migrations/20260615000000_fix_fefo_overload_security.sql
git status   # debe mostrar solo ese archivo staged
```

- [ ] **Step 3: Revisar la migración completa (no asumir)**
      Run: `cat supabase/migrations/20260615000000_fix_fefo_overload_security.sql`
      Confirmar que: (a) `CREATE OR REPLACE` de la firma enum con guardas de 0008 (`p_cantidad<=0`, idempotencia `ON CONFLICT`, escritura de `idempotency_key`), (b) `DROP FUNCTION IF EXISTS ...text...`, (c) `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role` sobre la firma vigente. Es idempotente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615000000_fix_fefo_overload_security.sql
git commit -m "fix(seguridad): cerrar overload con EXECUTE público de fn_descontar_insumo_fefo

El overload (p_tipo tipo_movimiento) tenía EXECUTE para anon/authenticated y
toma p_tenant_id del caller → manipulación de inventario cross-tenant vía
PostgREST. Recrea firma con guardas de 0008, DROP del overload text huérfano,
REVOKE PUBLIC/anon/authenticated + GRANT service_role.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push + PR + esperar CI verde + merge**

```bash
git push -u origin hotfix/fefo-overload-security
gh pr create --base main --title "fix(seguridad): cerrar overload público de fn_descontar_insumo_fefo" --body "Hotfix crítico. Cierra manipulación de inventario cross-tenant vía PostgREST RPC. Ver migración."
gh pr checks --watch   # esperar verde (incl. Supabase Preview)
gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Verificar que la migración se aplicó a prod y los grants desaparecieron**
      Esperar a que el workflow de deploy aplique la migración, luego ejecutar (vía Supabase MCP `execute_sql`, project `gyewxgtuzjbxzcvcfmwy`):

```sql
SELECT pg_get_function_identity_arguments(p.oid) AS args, r.rolname, ae.privilege_type
FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) ae
JOIN pg_roles r ON r.oid = ae.grantee
WHERE p.proname='fn_descontar_insumo_fefo' ORDER BY 1,2;
```

Expected: solo UNA firma (la enum), grants solo `postgres` + `service_role`. CERO filas con `anon`/`authenticated`. Si el text overload aún existe o quedan grants públicos, parar e investigar antes de continuar.

- [ ] **Step 7: Smoke FEFO post-fix**
      Confirmar que el descuento de inventario sigue funcionando desde la app (un despacho real o el test de integración FEFO de Fase 4). Si rompió, la app llamaba al overload incorrecto → corregir el call-site en `inventory`/`orders` infrastructure para usar la firma enum.

---

## Fase 2 — Consolidación de ramas en vuelo

**Objetivo:** Dejar `main` como única fuente de verdad. Mergear lo bueno, borrar lo stale, evitar trabajo duplicado/conflictos futuros.

**Dependencia:** Fase 1 mergeada (para rebasar la rama de seguridad sin su migración).

- [ ] **Step 1: Borrar rama stale `feature/kds-flujo-item`**
      Solo contiene `docs/superpowers/plans/2026-06-11-snack-buffet.md` + spec, trabajo ya shippeado en PR #18. Verificar y borrar:

```bash
git diff --stat main...feature/kds-flujo-item   # confirmar: solo 2 archivos de docs ya existentes en main
git push origin --delete feature/kds-flujo-item; git branch -D feature/kds-flujo-item
```

- [ ] **Step 2: Mergear PR #25 (almacén+inventario unificado)**

```bash
gh pr checks 25   # confirmar verde
gh pr merge 25 --squash --delete-branch
```

- [ ] **Step 3: Triage `chore/test-users-emails-descriptivos` (solapa con #25)**

```bash
git checkout main && git pull --ff-only
git diff --stat main...chore/test-users-emails-descriptivos
```

Decidir: si el cambio de emails de test-users (`scripts/reset-test-users.mjs`, `validate-test-users.mjs`) NO está cubierto por #25, cherry-pick SOLO esos dos archivos a una rama nueva `chore/test-users-emails` y abrir PR. Los cambios de UI (almacen/inventario/sidebar) están superados por #25 → descartarlos. Luego borrar la rama vieja. Si todo está cubierto, borrar la rama sin merge.

- [ ] **Step 4: Rebasar el resto de `fix/auditoria-seguridad-2026-06-15` (sin la migración de Fase 1)**
      La rama aún aporta: eliminación app-layer del chat (`qr-language-switcher.tsx`, `socket-events.ts` -43, `permissions.ts` chat perms, i18n chat keys), heartbeat timing-safe, order recall → 400 limpio, ajustes en `orders/actions.ts` + `order-repository.ts`, scripts test-users.

```bash
git checkout fix/auditoria-seguridad-2026-06-15
git rebase origin/main   # la migración 20260615000000 ya estará en main → git la resolverá como vacía; en conflicto, `git rm` la migración y `git rebase --continue`
pnpm lint && pnpm typecheck && pnpm test   # todo verde
git push --force-with-lease
gh pr create --base main --title "fix(seguridad): eliminación app-layer del chat + heartbeat timing-safe + recall limpio" --body "Resto de la auditoría 2026-06-15 (la migración FEFO ya se mergeó como hotfix)."
gh pr checks --watch && gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Finalizar y mergear `chore/limpieza-docs` (esta rama)**

```bash
git checkout chore/limpieza-docs && git rebase origin/main
git push --force-with-lease origin chore/limpieza-docs
gh pr create --base main --title "chore(docs): limpieza — duplicado de auditoría + refs rotas a analisis-v6.docx" --body "Elimina auditoría enterprise duplicada y todas las referencias a docs/analisis-v6.docx inexistente."
gh pr checks --watch && gh pr merge --squash --delete-branch
```

- [ ] **Step 6: Confirmar estado limpio**

```bash
git checkout main && git pull --ff-only
git branch --no-merged main   # idealmente vacío salvo ramas de trabajo nuevas
gh pr list --state open        # cero PRs viejos
```

---

## Fase 3 — Endurecimiento multi-tenant (ALTO — rompe al añadir 2º tenant)

**Objetivo:** Defensa en profundidad: triggers de validación de tenant y saneo de datos legacy, para que el sistema siga siendo correcto con >1 tenant en prod.

**Files:**

- Create: `supabase/migrations/20260619000000_tenant_validation_triggers.sql`
- Create: `supabase/migrations/20260619000001_fix_recetas_area_cocina.sql`
- Test: `apps/web/src/modules/orders/tests/tenant-isolation.test.ts`

- [ ] **Step 1 (AUD-A2/A3): Triggers de validación tenant en pedido_items y pedido_eventos**
      Crear migración con trigger `BEFORE INSERT/UPDATE` que valide que `pedido_items.pedido_id` y `pedido_eventos.pedido_id` pertenecen a un `pedidos` del MISMO `tenant_id`. Patrón: reusar/extender `fn_assert_same_tenant` si ya existe (`grep -rn assert_same_tenant supabase/migrations/`). Idempotente (`DROP TRIGGER IF EXISTS` + `CREATE`).

```sql
CREATE OR REPLACE FUNCTION public.fn_validate_pedido_item_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = NEW.pedido_id AND p.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'pedido_item.tenant_id % no coincide con pedido %', NEW.tenant_id, NEW.pedido_id USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_pedido_item_tenant ON public.pedido_items;
CREATE TRIGGER trg_validate_pedido_item_tenant BEFORE INSERT OR UPDATE ON public.pedido_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_pedido_item_tenant();
-- … análogo para pedido_eventos
```

- [ ] **Step 2: Test de aislamiento (debe fallar antes de la migración, pasar después)**
      Test en `tenant-isolation.test.ts` que intenta insertar un `pedido_item` con `tenant_id` distinto al del `pedido` y espera rechazo. Ejecutar primero contra esquema sin trigger (FAIL/insert permitido), luego con migración (PASS/rechazado).

- [ ] **Step 3 (AUD-A1): Sanear recetas legacy `area_produccion='cocina'`**

```bash
# Verificar primero qué hay realmente:
# (vía Supabase MCP) SELECT id, nombre, area_produccion FROM recetas WHERE area_produccion='cocina';
```

Migración que reasigna `'cocina'` al área correcta (`cocina_caliente`/`cocina_fria`) según criterio del catálogo, o añade constraint que prohíba el valor genérico. Idempotente con guard `WHERE area_produccion='cocina'`. **Si hay ambigüedad de a qué área va cada receta, PARAR y preguntar al dueño** (Principio Rector).

- [ ] **Step 4 (AUD-M1): Hacer idempotente el backfill `20260601000001`**
      Verificar `supabase/migrations/20260601000001*.sql`; añadir guards (`WHERE ... IS NULL` o `NOT EXISTS`) a los `UPDATE` para que re-ejecutar no duplique/sobrescriba. Como las migraciones ya aplicadas no se re-ejecutan, esto es defensivo para entornos frescos — documentar en el header.

- [ ] **Step 5: Migrar + PR + verificar en prod**
      PR, CI verde, merge. Verificar triggers vía MCP: `SELECT tgname FROM pg_trigger WHERE tgrelid='public.pedido_items'::regclass;`

---

## Fase 4 — Cobertura de tests del núcleo (C5 — merge-blocker Cerberus)

**Objetivo:** Cubrir con tests reales lo que el Principio Rector exige (FEFO atómico, idempotencia, aislamiento tenant) + actions críticas, y gatear coverage en CI.

> Nota: `ci.yml:149` YA ejecuta `vitest run --coverage` para `@dorado/web`. Lo que falta es (a) tests de contenido sobre la RPC/RLS/actions, y (b) un threshold que falle el build.

**Files:**

- Create: `apps/web/src/modules/inventory/tests/fefo-rpc.integration.test.ts`
- Create: `apps/web/src/modules/orders/tests/actions.integration.test.ts`
- Create: `apps/web/src/modules/costos/tests/costos.test.ts`
- Modify: `apps/web/vitest.config.ts` (coverage thresholds)

- [ ] **Step 1: Tests de la RPC FEFO (integración contra Supabase preview/branch)**
      Cubrir: descuento simple, FEFO order (vence antes sale antes), salta lotes vencidos, idempotencia (mismo `idempotency_key` no doble-descuenta), `p_cantidad<=0` rechazado, stock insuficiente rechazado, rechazo cross-tenant (un tenant no descuenta lotes de otro). Usar el cliente service-role en test setup, sembrar lotes, assertear `cantidad_actual` y filas en `movimientos_inventario`.

- [ ] **Step 2: Tests de actions críticas (orders/inventory)**
      Para cada server action que muta inventario/pedidos: caso feliz, rechazo por `assertCan` (rol sin permiso), optimistic locking (version stale → conflicto), Result type `{ok:false}` en error de dominio. Mockear `assertCan`/auth a nivel de port.

- [ ] **Step 3: Tests módulo costos (0 actuales)**
      `fn_costo_receta` cálculo en tiempo real desde lotes FEFO-next; receta sin lotes → costo 0/null definido; multi-ingrediente suma correcta.

- [ ] **Step 4: Habilitar threshold de coverage que falle el build**
      En `vitest.config.ts` (web) añadir `coverage.thresholds` (arrancar realista, p.ej. global 70%, y `modules/**/domain` 90% por el mandato del Principio Rector). Ejecutar `pnpm --filter @dorado/web exec vitest run --coverage` y ajustar el threshold al número alcanzable sin trampas. NO bajar de 90% en `domain/` de inventory (merma).

- [ ] **Step 5: Quitar `test.skip(true)` incondicionales en E2E**
      `grep -rn 'test.skip(true)' apps/web` → para cada uno, o implementar el lifecycle real, o convertir en `test.fixme` documentado con issue. No dejar skips silenciosos.

- [ ] **Step 6: PR + CI verde (coverage gate activo) + merge.**

---

## Fase 5 — Ops, DR y observabilidad (ALTO)

**Files:**

- Modify: `docs/runbook-dr.md`
- Modify: `.github/workflows/*backup*.yml` (o donde viva el backup)
- Modify: `apps/socket-server/src/*` (CORS), `vercel.json` / cron config

- [ ] **Step 1 (A-16): Corregir runbook DR**
      El backup genera `.sql.gz` (plain) pero el runbook dice `pg_restore` (espera `-Fc`). Cambiar instrucciones de restore a `gunzip -c backup.sql.gz | psql "$DATABASE_URL"`. Verificar el formato real que produce el workflow antes de editar.

- [ ] **Step 2 (A-26): Monitoreo externo de fallos de backup**
      Añadir notificación (Better Stack / email) en el step de backup con `if: failure()`. Hoy un backup fallido pasa desapercibido.

- [ ] **Step 3 (M-38): Eliminar doble disparo de alertas**
      pg_cron (cada 5 min) es la fuente real; el Vercel Cron `0 3 * * *` es fallback redundante que duplica. Deshabilitar el Vercel Cron (quitar de `vercel.json`) o documentar explícitamente por qué se conserva. Verificar que pg_cron está activo en prod (`SELECT * FROM cron.job;` vía MCP).

- [ ] **Step 4 (M-37): CORS multi-origin en socket-server**
      Permitir el dominio prod + patrón de Vercel preview (`*.vercel.app` del proyecto) en la config CORS de Socket.io, para no romper previews.

- [ ] **Step 5: Checklist post-deploy manual (documentar — lo ejecuta el dueño)**
      Generar/actualizar un doc `docs/runbooks/post-deploy-secrets.md` con: GitHub Secrets (`SUPABASE_PROJECT_REF`, `BACKUP_GPG_PASSPHRASE`, Sentry release token), Vercel env (`WIFI_NETWORK_NAME`, `WIFI_PASSWORD`), habilitación pg_cron/pg_net. **No son tareas de código; el dueño debe ejecutarlas.** Marcar claramente cuáles faltan.

- [ ] **Step 6: PR + merge.**

---

## Fase 6 — Backlog medio + limpieza final

> Cada tarea EMPIEZA verificando el estado actual (citas de memoria posiblemente obsoletas).

- [ ] **Step 1 (A-24): 8 `loading.tsx` faltantes en /admin**
      Crear `loading.tsx` con `<TableSkeleton/>` (reusar el componente existente) en: `admin/alertas`, `admin/costos`, `admin/personal`, `admin/proveedores`, `admin/qr`, `admin/tenants`, `admin/trazabilidad`, `admin/turnos`.

- [ ] **Step 2 (A-06): Remover workaround `createAdminClient` en inventory repo**
      `grep -rn 'createAdminClient\|admin(' apps/web/src/modules/inventory/infrastructure/`. Si aún se usa para INSERT de lotes (justificado por C-17 ya resuelto/RLS), cambiar a cliente normal y verificar que `personal_almacen` puede insertar bajo RLS (test). Si ya no existe, marcar resuelto.

- [ ] **Step 3 (C-19): Mover `cantidadNeta` de actions a application/**
      `grep -rn 'cantidadNeta\|neto' apps/web/src/modules/orders/`. Si la lógica de cálculo vive en `actions.ts`, moverla a `application/`. Si ya está, marcar resuelto.

- [ ] **Step 4 (SOLICITUD_PREPARACION): cerrar el flujo a medias**
      Listener vivo en `components/production/solicitudes-panel.tsx` + schema `solicitarPreparacionSchema`, pero sin emisor en `modules/`. Decidir con el dueño: (a) cablear el emisor (server action que emite `SOLICITUD_PREPARACION` por `BROADCAST_COCINA`), o (b) remover listener+schema si el flujo se descartó. **Preguntar antes de codificar.**

- [ ] **Step 5 (Socket ACL → audit_log): evento de seguridad, no warning**
      CLAUDE.md exige que un canal sin permiso genere `audit_log` (evento de seguridad) + desconexión, no solo `logger.warn`. Localizar el reject de ACL en `apps/socket-server/src/`, persistir en `audit_log` (vía API o RPC) además de desconectar.

- [ ] **Step 6: Bugs medios M-11/M-13/M-15/M-28/M-29**
- M-15 (bug real): join devuelve objeto pero se accede `[0]?.nombre` → nombres siempre `'—'` en `getLotesProximosVencer`. Verificar y corregir el acceso. Test que asserte el nombre.
- M-11: N+1 en `findEventosByPedido` → JOIN único.
- M-13: `let query: any` en analytics-repository → tipar (generar `database.types.ts` con `supabase gen types`).
- M-28: no renderizar `HabeasDataBanner` en rutas QR de pasajeros.
- M-29/DT-11: migrar `TEXTS` hardcodeados de `qr-passenger-app.tsx` a next-intl.

- [ ] **Step 7: Docs core al día**
- README: nº de tests real (455) y comandos vigentes.
- ARCHITECTURE.md: verificar que refleja el refoco operacional (4 KDS, merma en recepción, sin vuelos/afluencia/recepción) — actualizar secciones pre-refoco si quedan.
- CLAUDE.md: confirmar que ya no quedan referencias a módulos eliminados ni a merma-en-consumo (ya dice merma en recepción).

- [ ] **Step 8: Triage de los 31 TODO/FIXME/HACK**
      `grep -rniE 'TODO|FIXME|HACK|XXX' apps packages --include='*.ts' --include='*.tsx'`. Para cada uno: resolver si es trivial, o convertir en issue de GitHub con contexto. Cero TODOs sin dueño al cierre.

- [ ] **Step 9: PR(s) por sub-tema + merge.**

---

## Fase 7 — Verificación final de production-readiness

- [ ] **Step 1: Suite completa verde con coverage gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dorado/web exec vitest run --coverage   # threshold cumplido
pnpm --filter apps/web test:e2e                         # sin skips silenciosos
```

- [ ] **Step 2: Re-correr el production checklist**
      Recorrer `docs/audit/2026-05-27-enterprise/PRODUCTION_CHECKLIST.md` (adaptado al refoco — sin recepción/afluencia). Marcar cada ítem con evidencia. Recalcular readiness score.

- [ ] **Step 3: Verificación de seguridad en prod (MCP)**
- Grants de `fn_descontar_insumo_fefo`: solo service_role (Fase 1).
- Triggers de tenant activos (Fase 3).
- `SELECT * FROM cron.job;` → checks de alertas activos, sin duplicado.
- `get_advisors` (security + performance) sin hallazgos críticos.

- [ ] **Step 4: Tag de release**

```bash
git checkout main && git pull --ff-only
git tag -a v1.0.0 -m "Cierre de proyecto — production ready"
git push origin v1.0.0
```

- [ ] **Step 5: Actualizar memoria del proyecto**
      Actualizar `project_sprint_status.md` / `project_technical_debt.md` / `project_roadmap.md` con el estado final (deuda cerrada, vuln resuelta, branches consolidadas).

---

## Self-Review

- **Cobertura del backlog:** Fase 1 (vuln FEFO) · F2 (5 ramas) · F3 (AUD-A1/A2/A3, AUD-M1) · F4 (C5, costos 0-tests, E2E skips, coverage gate) · F5 (A-16, A-26, M-37, M-38, post-deploy) · F6 (A-24, A-06, C-19, SOLICITUD_PREPARACION, socket ACL, M-11/13/15/28/29, docs, TODOs) · F7 (verificación). Pendientes de roadmap mapeados: A-12 (mitigado por FOR UPDATE — documentar invariante en F7-step3), L-02 (CSP nonce — fuera de scope "100% funcional", dejar como issue), L-23 (Dependabot — F6 opcional o issue), M-04 (RPC atómico receta — F3 candidato si se materializa la decisión del dueño).
- **Decisiones que requieren al dueño (marcadas STOP en sus tareas):** F3-step3 (reasignación de área de recetas legacy), F6-step4 (cablear vs remover SOLICITUD_PREPARACION), A3 Cerberus precisión `numeric(14,2)` vs `(14,4)` para costo por gramo (evaluar en F3 si afecta integridad monetaria).
- **Sin placeholders de implementación:** las tareas con citas obsoletas (A-06, C-19, socket ACL) empiezan con verificación explícita en vez de asumir líneas.
