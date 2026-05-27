-- Agrega roles chef_cocina_fria y chef_cocina_caliente al enum user_role.
-- Cocina se divide en estaciones independientes: fría, caliente, pastelería, AMEX.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'chef_cocina_fria';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'chef_cocina_caliente';
