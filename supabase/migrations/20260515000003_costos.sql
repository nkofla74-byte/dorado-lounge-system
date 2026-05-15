-- Sprint E: fn_costo_receta — calcula el costo en tiempo real de una receta
-- usando el precio del lote activo más próximo a vencer (FEFO-next) por cada ingrediente.
-- La fórmula de cantidad bruta aplica el coeficiente de merma: bruta = cantidad / (1 - merma).

CREATE OR REPLACE FUNCTION public.fn_costo_receta(
  p_tenant_id uuid,
  p_receta_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_porciones   integer;
  v_costo_total numeric := 0;
  v_completo    boolean := true;
  v_ing         record;
  v_precio      numeric(14,2);
  v_bruta       numeric;
  v_ingredientes jsonb := '[]'::jsonb;
BEGIN
  SELECT porciones INTO v_porciones
  FROM public.recetas
  WHERE id         = p_receta_id
    AND tenant_id  = p_tenant_id
    AND activo     = true
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Receta no encontrada');
  END IF;

  FOR v_ing IN
    SELECT ri.insumo_id,
           i.nombre      AS insumo_nombre,
           i.unidad_medida,
           ri.cantidad,
           ri.merma_coeficiente
    FROM   public.receta_ingredientes ri
    JOIN   public.insumos i ON i.id = ri.insumo_id
    WHERE  ri.receta_id  = p_receta_id
      AND  ri.tenant_id  = p_tenant_id
  LOOP
    -- Precio del lote FEFO-next con costo registrado
    SELECT l.costo_unitario INTO v_precio
    FROM   public.lotes l
    WHERE  l.tenant_id   = p_tenant_id
      AND  l.insumo_id   = v_ing.insumo_id
      AND  l.activo      = true
      AND  l.deleted_at  IS NULL
      AND  l.costo_unitario IS NOT NULL
    ORDER  BY l.fecha_vencimiento ASC NULLS LAST, l.created_at ASC
    LIMIT  1;

    -- Cantidad bruta = cantidad / (1 - merma_coeficiente)
    v_bruta := v_ing.cantidad / NULLIF(1 - v_ing.merma_coeficiente, 0);

    IF v_precio IS NOT NULL THEN
      v_costo_total := v_costo_total + (v_bruta * v_precio);
    ELSE
      v_completo := false;
    END IF;

    v_ingredientes := v_ingredientes || jsonb_build_array(
      jsonb_build_object(
        'insumo_id',        v_ing.insumo_id,
        'insumo_nombre',    v_ing.insumo_nombre,
        'unidad_medida',    v_ing.unidad_medida,
        'cantidad',         v_ing.cantidad,
        'merma_coeficiente', v_ing.merma_coeficiente,
        'cantidad_bruta',   round(v_bruta::numeric, 4),
        'precio_unitario',  v_precio,
        'costo_ingrediente',
          CASE WHEN v_precio IS NOT NULL
               THEN round((v_bruta * v_precio)::numeric, 2)
               ELSE NULL END
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'receta_id',           p_receta_id,
    'porciones',           v_porciones,
    'costo_total',         round(v_costo_total::numeric, 2),
    'costo_por_porcion',
      CASE WHEN v_porciones > 0
           THEN round((v_costo_total / v_porciones)::numeric, 2)
           ELSE NULL END,
    'tiene_costo_completo', v_completo,
    'ingredientes',         v_ingredientes
  );
END;
$$;

-- Permiso explícito: los roles autenticados pueden invocarla
-- (SECURITY DEFINER garantiza que la consulta se ejecuta con privilegios del owner)
GRANT EXECUTE ON FUNCTION public.fn_costo_receta(uuid, uuid) TO authenticated;
