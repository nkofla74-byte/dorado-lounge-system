-- Enterprise Audit Fixes — 2026-05-27
-- Consolidates: C-02, C-03, C-05, C-06, C-08, C-17, C-21, A-05, A-15, A-22, A-28

-- ─────────────────────────────────────────────────────────────────────────────
-- C-02: recepcion bloqueado por RLS al escribir en afluencia_ingresos
-- Root cause: política INSERT solo permite superuser/admin/chef/sous_chef
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "afluencia_insert_staff" ON public.afluencia_ingresos;
CREATE POLICY "afluencia_insert_staff" ON public.afluencia_ingresos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'recepcion'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- C-03: Roles no-admin bloqueados por RLS al gestionar turnos
-- Root cause: turnos_modify_admin solo permite superuser/admin
-- Fix: política INSERT separada para todos los roles operativos (solo su propio turno)
-- La política ALL de admin se mantiene para que admin pueda cerrar turnos de otros.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "turnos_insert_staff" ON public.turnos;
CREATE POLICY "turnos_insert_staff" ON public.turnos
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'mesero_amex',
      'chef_cocina_fria', 'chef_cocina_caliente',
      'personal_snack', 'personal_buffet', 'personal_almacen',
      'personal_pasteleria', 'steward', 'recepcion'
    )
  );

DROP POLICY IF EXISTS "turnos_update_own" ON public.turnos;
-- La columna de turnos es responsable_id (no usuario_id — ese nombre nunca
-- existió en la tabla; bug detectado al aplicar en prod el 2026-06-10).
CREATE POLICY "turnos_update_own" ON public.turnos
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND responsable_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND responsable_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- C-17: personal_almacen excluido del INSERT en lotes
-- Root cause: lotes_modify_admin no incluye personal_almacen
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lotes_modify_admin" ON public.lotes;
CREATE POLICY "lotes_modify_admin" ON public.lotes
  FOR ALL TO authenticated
  USING (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IN (
      'superuser', 'admin', 'chef', 'sous_chef', 'personal_almacen'
    )
  )
  WITH CHECK (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- C-06: Materialized views sin filtro de tenant
-- Root cause: mat views no tienen RLS (no soportan RLS en Postgres)
-- Fix: crear vistas seguras con filtro de tenant desde JWT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_cogs_per_passenger_tenant
WITH (security_invoker = true) AS
SELECT * FROM public.mv_cogs_per_passenger
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

CREATE OR REPLACE VIEW public.v_consumo_vs_produccion_turno_tenant
WITH (security_invoker = true) AS
SELECT * FROM public.mv_consumo_vs_produccion_turno
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

CREATE OR REPLACE VIEW public.v_ocupacion_diaria_tenant
WITH (security_invoker = true) AS
SELECT * FROM public.mv_ocupacion_diaria
WHERE tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;

-- Revoke direct access to mat views from authenticated
REVOKE SELECT ON public.mv_cogs_per_passenger FROM authenticated;
REVOKE SELECT ON public.mv_consumo_vs_produccion_turno FROM authenticated;
REVOKE SELECT ON public.mv_ocupacion_diaria FROM authenticated;

-- Grant access to the filtered views
GRANT SELECT ON public.v_cogs_per_passenger_tenant TO authenticated;
GRANT SELECT ON public.v_consumo_vs_produccion_turno_tenant TO authenticated;
GRANT SELECT ON public.v_ocupacion_diaria_tenant TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-08: pedidos.idempotency_key tiene UNIQUE global (cross-tenant)
-- Root cause: constraint es global, colisión entre tenants posible
-- Fix: drop global constraint, create unique index scoped to tenant
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_idempotency_key_key;
DROP INDEX IF EXISTS idx_pedidos_idempotency_tenant;
CREATE UNIQUE INDEX idx_pedidos_idempotency_tenant
  ON public.pedidos (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-21: FEFO no filtra lotes vencidos
-- Root cause: cursor FEFO no tiene filtro fecha_vencimiento >= CURRENT_DATE
-- Fix: reescribir fn_descontar_insumo_fefo con filtro de vencimiento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_descontar_insumo_fefo(
  p_tenant_id       uuid,
  p_insumo_id       uuid,
  p_cantidad        numeric(12,4),
  p_idempotency_key text,
  p_tipo            public.tipo_movimiento,
  p_referencia_id   uuid DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_usuario_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restante    numeric(12,4) := p_cantidad;
  v_lote        record;
  v_descuento   numeric(12,4);
  v_op_id       uuid := gen_random_uuid();
  v_existente   jsonb;
BEGIN
  -- Idempotency check
  SELECT resultado INTO v_existente
  FROM public.operaciones_idempotentes
  WHERE clave = p_idempotency_key;

  IF v_existente IS NOT NULL THEN
    RETURN v_existente;
  END IF;

  -- Pre-check stock disponible (solo lotes no vencidos)
  IF (
    SELECT COALESCE(SUM(cantidad_actual), 0)
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
      AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
  ) < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para insumo %. Solicitado: %, Disponible: %',
      p_insumo_id,
      p_cantidad,
      (SELECT COALESCE(SUM(cantidad_actual), 0) FROM public.lotes
       WHERE tenant_id = p_tenant_id AND insumo_id = p_insumo_id
         AND activo = true AND deleted_at IS NULL
         AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE))
    USING ERRCODE = 'P0001';
  END IF;

  -- FEFO cursor: iterate lots in expiration order, skip expired
  FOR v_lote IN
    SELECT id, cantidad_actual
    FROM public.lotes
    WHERE tenant_id = p_tenant_id
      AND insumo_id = p_insumo_id
      AND activo = true
      AND deleted_at IS NULL
      AND cantidad_actual > 0
      AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= CURRENT_DATE)
    ORDER BY
      fecha_vencimiento ASC NULLS LAST,
      created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_descuento := LEAST(v_lote.cantidad_actual, v_restante);

    UPDATE public.lotes
    SET
      cantidad_actual = cantidad_actual - v_descuento,
      updated_at = now()
    WHERE id = v_lote.id;

    INSERT INTO public.movimientos_inventario (
      tenant_id,
      insumo_id,
      lote_id,
      tipo,
      cantidad,
      operacion_id,
      referencia_id,
      referencia_tipo,
      usuario_id
    ) VALUES (
      p_tenant_id,
      p_insumo_id,
      v_lote.id,
      p_tipo,
      -v_descuento,
      v_op_id,
      p_referencia_id,
      p_referencia_tipo,
      p_usuario_id
    );

    v_restante := v_restante - v_descuento;
  END LOOP;

  IF v_restante > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente tras FEFO para insumo %', p_insumo_id
    USING ERRCODE = 'P0001';
  END IF;

  -- Record idempotent operation
  INSERT INTO public.operaciones_idempotentes (clave, resultado)
  VALUES (p_idempotency_key, jsonb_build_object('ok', true, 'operacion_id', v_op_id));

  RETURN jsonb_build_object('ok', true, 'operacion_id', v_op_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C-05: Race condition en cadena hash del audit_log
-- Root cause: SELECT prev_hash sin lock → fork bajo concurrencia
-- Fix: advisory lock por tenant antes de leer prev_hash
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_log_set_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
BEGIN
  -- Serialize inserts per tenant to prevent hash chain forks
  PERFORM pg_advisory_xact_lock(
    hashtext(COALESCE(NEW.tenant_id::text, '__global__'))
  );

  SELECT hash INTO v_prev_hash
  FROM public.audit_log
  WHERE
    CASE
      WHEN NEW.tenant_id IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = NEW.tenant_id
    END
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  NEW.prev_hash := v_prev_hash;
  NEW.hash := encode(
    extensions.digest(
      COALESCE(v_prev_hash, '') ||
      NEW.id::text ||
      COALESCE(NEW.tenant_id::text, '') ||
      COALESCE(NEW.user_id::text, '') ||
      NEW.action ||
      NEW.resource_type ||
      COALESCE(NEW.resource_id::text, '') ||
      NEW.payload::text ||
      NEW.created_at::text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-05: Funciones de retención PUBLIC (callable por cualquier usuario)
-- Root cause: fn_purgar_* sin REVOKE FROM PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.fn_purgar_mensajes_chat_antiguos() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.fn_purgar_mensajes_chat_antiguos() FROM authenticated;
  REVOKE EXECUTE ON FUNCTION public.fn_purgar_afluencia_antigua() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.fn_purgar_afluencia_antigua() FROM authenticated;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-28: buffet_tickets_turno permite múltiples registros por turno
-- Fix: unique constraint (tenant_id, turno_id)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.buffet_tickets_turno
    ADD CONSTRAINT uq_buffet_tickets_turno_turno UNIQUE (tenant_id, turno_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-22: fn_siguiente_codigo_insumo/lote incluyen pg_temp en search_path
-- Fix: remove pg_temp from search_path in SECURITY DEFINER functions
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER FUNCTION public.fn_siguiente_codigo_insumo(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION public.fn_siguiente_codigo_lote(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-23: fn_costo_receta marcada como STABLE (incorrecto, lee lotes)
-- Fix: change to VOLATILE
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER FUNCTION public.fn_costo_receta(uuid, uuid) VOLATILE;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A-15: cerrar_turnos_expirados sin SECURITY DEFINER ni SET search_path
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER FUNCTION public.cerrar_turnos_expirados() SECURITY DEFINER;
  ALTER FUNCTION public.cerrar_turnos_expirados() SET search_path = public;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- M-16: Indices faltantes en turno_id de tablas operativas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_turno_id
  ON public.movimientos_inventario (turno_id)
  WHERE turno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mermas_turno_id
  ON public.mermas (turno_id)
  WHERE turno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_despachos_turno_id
  ON public.despachos (turno_id)
  WHERE turno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tandas_produccion_turno_id
  ON public.tandas_produccion (turno_id)
  WHERE turno_id IS NOT NULL;
