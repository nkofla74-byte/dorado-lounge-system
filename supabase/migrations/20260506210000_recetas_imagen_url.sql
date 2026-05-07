ALTER TABLE public.recetas
  ADD COLUMN IF NOT EXISTS imagen_url TEXT;

COMMENT ON COLUMN public.recetas.imagen_url IS
  'URL pública de la foto del plato (Supabase Storage bucket: recetas). Opcional.';
