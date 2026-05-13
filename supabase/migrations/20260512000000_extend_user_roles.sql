-- Extiende el enum user_role con los 4 roles operativos adicionales
-- definidos en packages/shared-types/src/enums.ts pero ausentes en la DB.
-- ALTER TYPE ADD VALUE IF NOT EXISTS es seguro de re-ejecutar (idempotente en PG 12+).

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'recepcion';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'personal_almacen';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'personal_pasteleria';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'steward';
