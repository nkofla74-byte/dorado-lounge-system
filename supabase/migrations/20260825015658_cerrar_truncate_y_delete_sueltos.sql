-- =============================================================================
-- 20260825015658_cerrar_truncate_y_delete_sueltos.sql
--
-- HALLAZGO H-2 — punto de retomada post-despliegue de PR #28
-- (docs/remediacion/ESTADO-Y-PROXIMOS-PASOS.md §H-2).
--
-- La migración 20260822000003_politicas_por_permiso.sql revocó DELETE en las
-- 20 tablas operativas pero no tocó TRUNCATE, que ignora la RLS por completo y
-- no dispara los triggers `prevent_mutation()` (son FOR EACH ROW; TRUNCATE
-- nunca los ejecuta). Verificado contra producción: `anon`/`authenticated`
-- tenían TRUNCATE en las 25 tablas y vistas de `public`, incluidas
-- `audit_log` y `domain_events`.
--
-- Además quedaban 3 objetos con DELETE vivo y sin protección de trigger:
-- `operaciones_idempotentes`, `tenant_codigo_counters` (el contador de
-- SKU/lote que CLAUDE.md marca «solo RPC») y la vista
-- `v_consumo_vs_produccion_turno_tenant`. `audit_log` y `domain_events`
-- también tienen DELETE concedido, pero ahí sí hay trigger de fila que lo
-- bloquea — no se tocan, siguiendo el fix acordado.
--
-- No explotable por la vía pública: PostgREST no expone TRUNCATE, haría falta
-- conexión directa a Postgres con la contraseña de la base. Puramente
-- restrictivo y de rollback trivial (GRANT de vuelta).
-- =============================================================================

-- ── 1) TRUNCATE fuera para anon/authenticated en todo el esquema public ─────
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Que las tablas futuras nazcan sin TRUNCATE, sin depender de que cada
-- migración se acuerde de revocarlo a mano. Solo `FOR ROLE postgres`: es el
-- rol que corre las migraciones (CI y la integración GitHub de Supabase) y
-- por tanto el dueño de toda tabla que se cree de aquí en adelante.
-- `supabase_admin` es superusuario y no queda `postgres` afiliado a ese rol
-- (verificado contra producción vía pg_auth_members), así que un
-- `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` fallaría por permisos
-- al aplicarse con las credenciales normales de migración.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- ── 2) DELETE en los 3 objetos sueltos sin protección de trigger ────────────
REVOKE DELETE ON TABLE public.operaciones_idempotentes FROM anon, authenticated;
REVOKE DELETE ON TABLE public.tenant_codigo_counters   FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_consumo_vs_produccion_turno_tenant'
  ) THEN
    REVOKE DELETE ON public.v_consumo_vs_produccion_turno_tenant FROM anon, authenticated;
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (manual):
--   GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT TRUNCATE ON TABLES TO anon, authenticated;
--   GRANT DELETE ON public.operaciones_idempotentes, public.tenant_codigo_counters,
--     public.v_consumo_vs_produccion_turno_tenant TO anon, authenticated;
-- NO RECOMENDADO: reabre H-2.
-- =============================================================================
