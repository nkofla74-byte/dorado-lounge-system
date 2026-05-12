# /plan-status

Muestra el estado actual del plan de producción del proyecto Dorado Lounge System.

## Instrucciones

Revisa el estado real del código para determinar qué está hecho y qué falta. No te fíes solo de la memoria — verifica con el filesystem.

### Checks a realizar

**FASE 1 — Sprint 0 / Fundación**

- [ ] CI/CD deploy: ¿existe `.github/workflows/deploy.yml` con jobs de Vercel y Supabase?
- [ ] E2E tests: ¿existe `apps/web/e2e/` con tests Playwright?
- [ ] Route guards por rol: ¿`apps/web/src/middleware.ts` tiene `ROLE_ALLOWED_ROUTES`?
- [ ] Better Stack: ¿`@logtail/next` en `apps/web/package.json`?

**FASE 2 — Chat inter-zona**

- [ ] Módulo chat: ¿existe `apps/web/src/modules/chat/`?
- [ ] UI chat: ¿existe `apps/web/src/components/chat/chat-panel.tsx`?

**FASE 3 — Seguridad y Compliance**

- [ ] Turnstile: ¿existe `apps/web/src/lib/turnstile/verify.ts`?
- [ ] Habeas Data: ¿existe `supabase/migrations/*habeas*` o `*gdpr*`?
- [ ] CSP headers: ¿`apps/web/next.config.ts` tiene `Content-Security-Policy`?

**FASE 4 — QR PWA**

- [ ] PWA manifest: ¿existe `apps/web/public/manifest.json`?
- [ ] Service Worker QR: ¿existe SW configurado para `/qr`?

**FASE 5 — Resiliencia Offline**

- [ ] IndexedDB queue: ¿existe `apps/web/src/lib/offline/queue.ts`?
- [ ] Sync: ¿existe `apps/web/src/lib/offline/sync.ts`?
- [ ] Offline banner: ¿existe `apps/web/src/components/layout/offline-banner.tsx`?

**FASE 6 — Feature Flags + RBAC**

- [ ] Feature flags UI: ¿existe `apps/web/src/components/superuser/feature-flags-panel.tsx`?
- [ ] RBAC matrix: ¿existe `apps/web/src/components/superuser/permissions-matrix.tsx`?

**FASE 7 — Disaster Recovery**

- [ ] Backup workflow: ¿existe `.github/workflows/backup.yml`?
- [ ] Runbook DR: ¿existe `docs/runbook-dr.md`?

**FASE 8 — Flights API**

- [ ] Módulo flights: ¿existe `apps/web/src/modules/flights/`?

### Output esperado

Genera una tabla de progreso:

| Fase | Descripción                    | Estado   | %   |
| ---- | ------------------------------ | -------- | --- |
| 1    | Fundación CI/CD + E2E + Guards | ⬜/🟨/✅ | x%  |
| 2    | Chat inter-zona                | ⬜/🟨/✅ | x%  |
| 3    | Seguridad y compliance         | ⬜/🟨/✅ | x%  |
| 4    | QR PWA completo                | ⬜/🟨/✅ | x%  |
| 5    | Resiliencia offline            | ⬜/🟨/✅ | x%  |
| 6    | Feature Flags + RBAC UI        | ⬜/🟨/✅ | x%  |
| 7    | Disaster Recovery              | ⬜/🟨/✅ | x%  |
| 8    | Flights API                    | ⬜/🟨/✅ | x%  |

Leyenda: ⬜ pendiente · 🟨 parcial · ✅ completo

Termina con: "**Próximo paso recomendado:** [descripción de la siguiente tarea más prioritaria]"
