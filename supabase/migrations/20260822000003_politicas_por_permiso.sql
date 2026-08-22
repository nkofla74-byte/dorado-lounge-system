-- =============================================================================
-- 20260822000003_politicas_por_permiso.sql
--
-- HALLAZGOS F-002 (parcial), F-006, F-035 y F-036 — auditoría forense 2026-08-22.
-- Causa raíz RC-1 (la base expone más escritura que la capa de aplicación) y
-- RC-2 (listas de roles congeladas en el modelo anterior).
--
-- Dos defectos concretos, ambos verificados contra una base real:
--
--   1. F-036 — Toda política `FOR ALL` repetía el predicado de rol en `USING`
--      pero su `WITH CHECK` validaba ÚNICAMENTE `tenant_id`. `USING` no se
--      aplica al INSERT, así que cualquier rol autenticado podía insertar en
--      insumos, lotes, recetas, tandas_produccion, despachos, proveedores y
--      requisiciones. Un mesero_amex podía inyectar lotes con stock fantasma,
--      que es una violación directa del Principio Rector.
--
--   2. F-002 (vector de borrado) — `FOR ALL` incluye DELETE y ninguna migración
--      revocó el privilegio de tabla. El modelo usa borrado lógico
--      (`deleted_at`), así que ningún rol de aplicación necesita DELETE físico,
--      pero mesero_amex y personal_almacen podían borrar pedidos y lotes.
--
--   3. F-006/F-035 — `tandas_modify_cocina` seguía listando el rol deprecado
--      'chef' y omitía chef_cocina_fria, chef_cocina_caliente y
--      personal_pasteleria, que sí tienen production:write. Podían crear tandas
--      (por el `WITH CHECK` débil) pero no avanzarlas: producción y pastelería
--      quedaban a medias.
--
-- ESTE FIX sustituye cada `FOR ALL` por políticas explícitas de INSERT y UPDATE
-- que evalúan `fn_puede_en_tenant(<permiso>, tenant_id)` en `USING` **y** en
-- `WITH CHECK`, y revoca DELETE en todas las tablas operativas.
--
-- Deliberadamente NO se tocan las políticas de SELECT: leer el catálogo del
-- propio tenant no es el vector explotado, y estrecharlas rompería lecturas
-- legítimas (p. ej. el mesero necesita ver los ingredientes de la receta al
-- entregar). Queda registrado como riesgo residual aceptado en SECURITY_CHANGES.md.
--
-- pedidos / pedido_items / pedido_eventos / pedido_item_eventos se tratan en
-- 20260822000004: su escritura pasa entera a RPCs y requiere el cambio de app
-- en el mismo despliegue.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY, REVOKE.
-- =============================================================================

-- ── 1) Sin borrado físico en tablas operativas ───────────────────────────────
-- El borrado lógico (deleted_at) es la convención del proyecto; audit_log y
-- domain_events ya tienen triggers que bloquean DELETE. Aquí se cierra el resto
-- a nivel de privilegio de tabla, que es anterior a la RLS y no depende de que
-- ninguna política esté bien escrita.
DO $$
DECLARE
  v_tabla text;
  v_tablas text[] := ARRAY[
    'insumos', 'lotes', 'movimientos_inventario', 'mermas',
    'recetas', 'receta_ingredientes', 'tandas_produccion', 'despachos',
    'pedidos', 'pedido_items', 'pedido_eventos', 'pedido_item_eventos',
    'turnos', 'proveedores', 'alertas',
    'requisiciones', 'requisicion_items', 'requisicion_eventos',
    'users', 'tenants'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_tabla
    ) THEN
      EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM anon, authenticated', v_tabla);
    END IF;
  END LOOP;
END $$;


-- ── 2) Inventario ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insumos_modify_admin"   ON public.insumos;
DROP POLICY IF EXISTS "insumos_insert_permiso" ON public.insumos;
DROP POLICY IF EXISTS "insumos_update_permiso" ON public.insumos;

CREATE POLICY "insumos_insert_permiso" ON public.insumos
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('inventory:write', tenant_id));

CREATE POLICY "insumos_update_permiso" ON public.insumos
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('inventory:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('inventory:write', tenant_id));

DROP POLICY IF EXISTS "lotes_modify_admin"   ON public.lotes;
DROP POLICY IF EXISTS "lotes_insert_permiso" ON public.lotes;
DROP POLICY IF EXISTS "lotes_update_permiso" ON public.lotes;

CREATE POLICY "lotes_insert_permiso" ON public.lotes
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('inventory:write', tenant_id));

CREATE POLICY "lotes_update_permiso" ON public.lotes
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('inventory:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('inventory:write', tenant_id));

-- mermas: la app escribe con service_role (fn_registrar_merma), pero se deja la
-- política alineada al permiso por si algún cliente legítimo inserta directo.
DROP POLICY IF EXISTS "mermas_insert_staff"   ON public.mermas;
DROP POLICY IF EXISTS "mermas_insert_permiso" ON public.mermas;

CREATE POLICY "mermas_insert_permiso" ON public.mermas
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('inventory:merma', tenant_id));


-- ── 3) Recetario ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recetas_modify_admin"   ON public.recetas;
DROP POLICY IF EXISTS "recetas_insert_permiso" ON public.recetas;
DROP POLICY IF EXISTS "recetas_update_permiso" ON public.recetas;

CREATE POLICY "recetas_insert_permiso" ON public.recetas
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('recipes:write', tenant_id));

CREATE POLICY "recetas_update_permiso" ON public.recetas
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('recipes:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('recipes:write', tenant_id));

DROP POLICY IF EXISTS "receta_ing_modify_admin"   ON public.receta_ingredientes;
DROP POLICY IF EXISTS "receta_ing_insert_permiso" ON public.receta_ingredientes;
DROP POLICY IF EXISTS "receta_ing_update_permiso" ON public.receta_ingredientes;

CREATE POLICY "receta_ing_insert_permiso" ON public.receta_ingredientes
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('recipes:write', tenant_id));

CREATE POLICY "receta_ing_update_permiso" ON public.receta_ingredientes
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('recipes:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('recipes:write', tenant_id));


-- ── 4) Producción ────────────────────────────────────────────────────────────
-- Aquí vive F-006: la lista anterior era ('superuser','admin','chef','sous_chef').
DROP POLICY IF EXISTS "tandas_modify_cocina"  ON public.tandas_produccion;
DROP POLICY IF EXISTS "tandas_insert_permiso" ON public.tandas_produccion;
DROP POLICY IF EXISTS "tandas_update_permiso" ON public.tandas_produccion;

CREATE POLICY "tandas_insert_permiso" ON public.tandas_produccion
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('production:write', tenant_id));

CREATE POLICY "tandas_update_permiso" ON public.tandas_produccion
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('production:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('production:write', tenant_id));

DROP POLICY IF EXISTS "despachos_modify_cocina"  ON public.despachos;
DROP POLICY IF EXISTS "despachos_insert_permiso" ON public.despachos;
DROP POLICY IF EXISTS "despachos_update_permiso" ON public.despachos;

CREATE POLICY "despachos_insert_permiso" ON public.despachos
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('production:write', tenant_id));

CREATE POLICY "despachos_update_permiso" ON public.despachos
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('production:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('production:write', tenant_id));


-- ── 5) Turnos ────────────────────────────────────────────────────────────────
-- Un usuario abre y cierra SU turno; admin puede operar los de su sala.
DROP POLICY IF EXISTS "turnos_modify_admin"   ON public.turnos;
DROP POLICY IF EXISTS "turnos_insert_staff"   ON public.turnos;
DROP POLICY IF EXISTS "turnos_update_own"     ON public.turnos;
DROP POLICY IF EXISTS "turnos_insert_permiso" ON public.turnos;
DROP POLICY IF EXISTS "turnos_update_permiso" ON public.turnos;

CREATE POLICY "turnos_insert_permiso" ON public.turnos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_puede_en_tenant('turnos:write', tenant_id)
    AND responsable_id = public.fn_jwt_user()
  );

CREATE POLICY "turnos_update_permiso" ON public.turnos
  FOR UPDATE TO authenticated
  USING (
    public.fn_puede_en_tenant('turnos:write', tenant_id)
    AND (responsable_id = public.fn_jwt_user() OR public.fn_puede('users:write'))
  )
  WITH CHECK (
    public.fn_puede_en_tenant('turnos:write', tenant_id)
    AND (responsable_id = public.fn_jwt_user() OR public.fn_puede('users:write'))
  );


-- ── 6) Proveedores ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "proveedores_modify_admin"   ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_insert_permiso" ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_update_permiso" ON public.proveedores;

CREATE POLICY "proveedores_insert_permiso" ON public.proveedores
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('proveedores:write', tenant_id));

CREATE POLICY "proveedores_update_permiso" ON public.proveedores
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('proveedores:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('proveedores:write', tenant_id));


-- ── 7) Alertas ───────────────────────────────────────────────────────────────
-- F-016: la política de lectura por área omitía chef_cocina_fria/caliente y
-- personal_pasteleria, que sí tienen alertas:read. Se unifica contra la matriz:
-- quien tiene el permiso ve las alertas de su sala.
DROP POLICY IF EXISTS "alertas_select_admin"   ON public.alertas;
DROP POLICY IF EXISTS "alertas_select_area"    ON public.alertas;
DROP POLICY IF EXISTS "alertas_select_permiso" ON public.alertas;
DROP POLICY IF EXISTS "alertas_insert_admin"   ON public.alertas;
DROP POLICY IF EXISTS "alertas_insert_permiso" ON public.alertas;
DROP POLICY IF EXISTS "alertas_update_leida"   ON public.alertas;
DROP POLICY IF EXISTS "alertas_update_permiso" ON public.alertas;

CREATE POLICY "alertas_select_permiso" ON public.alertas
  FOR SELECT TO authenticated
  USING (public.fn_puede_en_tenant('alertas:read', tenant_id));

CREATE POLICY "alertas_insert_permiso" ON public.alertas
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('alertas:write', tenant_id));

-- Marcar como leída es parte de la lectura operativa, no de la administración.
CREATE POLICY "alertas_update_permiso" ON public.alertas
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('alertas:read', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('alertas:read', tenant_id));


-- ── 8) Requisiciones ─────────────────────────────────────────────────────────
-- La transición fina (quién puede despachar vs. confirmar) la valida la capa de
-- aplicación sobre el estado; aquí se exige el permiso de participación.
DROP POLICY IF EXISTS "requisiciones_tenant_modify"  ON public.requisiciones;
DROP POLICY IF EXISTS "requisiciones_insert_permiso" ON public.requisiciones;
DROP POLICY IF EXISTS "requisiciones_update_permiso" ON public.requisiciones;

CREATE POLICY "requisiciones_insert_permiso" ON public.requisiciones
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('requisiciones:create', tenant_id));

CREATE POLICY "requisiciones_update_permiso" ON public.requisiciones
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.fn_jwt_tenant()
    AND (public.fn_puede('requisiciones:despachar')
      OR public.fn_puede('requisiciones:confirmar')
      OR public.fn_puede('requisiciones:cancel'))
  )
  WITH CHECK (
    tenant_id = public.fn_jwt_tenant()
    AND (public.fn_puede('requisiciones:despachar')
      OR public.fn_puede('requisiciones:confirmar')
      OR public.fn_puede('requisiciones:cancel'))
  );

DROP POLICY IF EXISTS "requisicion_items_tenant_modify"  ON public.requisicion_items;
DROP POLICY IF EXISTS "requisicion_items_insert_permiso" ON public.requisicion_items;
DROP POLICY IF EXISTS "requisicion_items_update_permiso" ON public.requisicion_items;

CREATE POLICY "requisicion_items_insert_permiso" ON public.requisicion_items
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('requisiciones:create', tenant_id));

CREATE POLICY "requisicion_items_update_permiso" ON public.requisicion_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.fn_jwt_tenant()
    AND (public.fn_puede('requisiciones:despachar')
      OR public.fn_puede('requisiciones:confirmar')
      OR public.fn_puede('requisiciones:cancel'))
  )
  WITH CHECK (
    tenant_id = public.fn_jwt_tenant()
    AND (public.fn_puede('requisiciones:despachar')
      OR public.fn_puede('requisiciones:confirmar')
      OR public.fn_puede('requisiciones:cancel'))
  );


-- ── 9) Usuarios ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_modify_admin"   ON public.users;
DROP POLICY IF EXISTS "users_insert_permiso" ON public.users;
DROP POLICY IF EXISTS "users_update_permiso" ON public.users;

CREATE POLICY "users_insert_permiso" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_puede_en_tenant('users:write', tenant_id));

CREATE POLICY "users_update_permiso" ON public.users
  FOR UPDATE TO authenticated
  USING      (public.fn_puede_en_tenant('users:write', tenant_id))
  WITH CHECK (public.fn_puede_en_tenant('users:write', tenant_id));

-- =============================================================================
-- ROLLBACK (manual): reaplicar las políticas `FOR ALL` originales de
--   0003_inventory_core.sql, 0005_production_orders.sql, 0006_operations.sql,
--   20260515000001_proveedores.sql, 20260515000002_alertas.sql,
--   20260612120000_requisiciones.sql, 20260527000000_enterprise_audit_fixes.sql
-- y `GRANT DELETE ON <tablas> TO authenticated`.
-- NO RECOMENDADO: reabre F-002 (borrado físico) y F-036 (INSERT sin rol).
-- =============================================================================
