-- Fix: audit_log_set_hash referencia digest() sin calificar el schema.
-- pgcrypto vive en `extensions` (estándar Supabase), pero el trigger tenía
-- `SET search_path = public`, por lo que digest() no se resolvía y todas las
-- inserciones a audit_log fallaban silenciosamente (fail-open en lib/audit.ts).
-- Solución: calificar como `extensions.digest(...)` para no depender del search_path.
CREATE OR REPLACE FUNCTION public.audit_log_set_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
BEGIN
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
