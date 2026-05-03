-- =============================================================================
-- 0006_operations.sql
-- Turnos + Buffet tickets + Afluencia + FKs cruzadas de migraciones anteriores
-- Idempotente.
-- =============================================================================

-- ── Tabla: turnos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.turnos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id),
  nombre          text        NOT NULL,    -- e.g. "Turno A - 06:00–14:00"
  responsable_id  uuid        REFERENCES public.users(id),
  iniciado_at     timestamptz NOT NULL DEFAULT now(),
  cerrado_at      timestamptz,
  activo          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turnos_tenant        ON public.turnos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_turnos_tenant_activo ON public.turnos(tenant_id, activo);

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "turnos_select_staff" ON public.turnos;
CREATE POLICY "turnos_select_staff" ON public.turnos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "turnos_modify_admin" ON public.turnos;
CREATE POLICY "turnos_modify_admin" ON public.turnos
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin')
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);


-- ── Tabla: buffet_tickets_turno ───────────────────────────────────────────────
-- Registra la cantidad de tickets recolectados al cierre del buffet.
-- 1 ticket = 1 servicio. No hay registro individual en tiempo real.
CREATE TABLE IF NOT EXISTS public.buffet_tickets_turno (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES public.tenants(id),
  turno_id         uuid        NOT NULL REFERENCES public.turnos(id),
  cantidad_tickets integer     NOT NULL CHECK (cantidad_tickets >= 0),
  registrado_por   uuid        REFERENCES public.users(id),
  idempotency_key  text        UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buffet_tickets_turno ON public.buffet_tickets_turno(turno_id);

ALTER TABLE public.buffet_tickets_turno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buffet_tickets_select_staff" ON public.buffet_tickets_turno;
CREATE POLICY "buffet_tickets_select_staff" ON public.buffet_tickets_turno
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "buffet_tickets_insert_buffet" ON public.buffet_tickets_turno;
CREATE POLICY "buffet_tickets_insert_buffet" ON public.buffet_tickets_turno
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'personal_buffet'
    )
  );


-- ── Tabla: afluencia_ingresos ─────────────────────────────────────────────────
-- Registro de pasajeros que ingresan al lounge por turno.
CREATE TABLE IF NOT EXISTS public.afluencia_ingresos (
  id              uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid                  NOT NULL REFERENCES public.tenants(id),
  turno_id        uuid                  NOT NULL REFERENCES public.turnos(id),
  cantidad        integer               NOT NULL CHECK (cantidad > 0),
  zona            public.zona_servicio,             -- NULL = lounge completo
  registrado_por  uuid                  REFERENCES public.users(id),
  vuelo_numero    text,
  ingresado_at    timestamptz           NOT NULL DEFAULT now(),
  created_at      timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_afluencia_turno      ON public.afluencia_ingresos(turno_id);
CREATE INDEX IF NOT EXISTS idx_afluencia_tenant     ON public.afluencia_ingresos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_afluencia_created_at ON public.afluencia_ingresos(created_at);

ALTER TABLE public.afluencia_ingresos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "afluencia_select_admin" ON public.afluencia_ingresos;
CREATE POLICY "afluencia_select_admin" ON public.afluencia_ingresos
  FOR SELECT TO authenticated
  USING (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

DROP POLICY IF EXISTS "afluencia_insert_staff" ON public.afluencia_ingresos;
CREATE POLICY "afluencia_insert_staff" ON public.afluencia_ingresos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN ('superuser', 'admin', 'chef', 'sous_chef')
  );


-- ── FKs cruzadas: turno_id en tablas de migraciones anteriores ────────────────
-- Se agregan aquí porque public.turnos no existía en 0003–0005.
-- DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL garantiza idempotencia.

DO $$ BEGIN
  ALTER TABLE public.movimientos_inventario ADD CONSTRAINT fk_mov_inv_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.mermas ADD CONSTRAINT fk_mermas_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tandas_produccion ADD CONSTRAINT fk_tandas_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.pedidos ADD CONSTRAINT fk_pedidos_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.despachos ADD CONSTRAINT fk_despachos_turno FOREIGN KEY (turno_id) REFERENCES public.turnos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- ROLLBACK:
-- ALTER TABLE public.despachos         DROP CONSTRAINT IF EXISTS fk_despachos_turno;
-- ALTER TABLE public.pedidos           DROP CONSTRAINT IF EXISTS fk_pedidos_turno;
-- ALTER TABLE public.tandas_produccion DROP CONSTRAINT IF EXISTS fk_tandas_turno;
-- ALTER TABLE public.mermas            DROP CONSTRAINT IF EXISTS fk_mermas_turno;
-- ALTER TABLE public.movimientos_inventario DROP CONSTRAINT IF EXISTS fk_mov_inv_turno;
-- DROP TABLE IF EXISTS public.afluencia_ingresos;
-- DROP TABLE IF EXISTS public.buffet_tickets_turno;
-- DROP TABLE IF EXISTS public.turnos;
-- =============================================================================
