'use client';

import { createBrowserClient } from '@supabase/ssr';

// Cliente para componentes del lado del cliente (use client).
// Usa anon key — la RLS de Postgres es la línea de defensa.
export function createClient() {
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
  );
}
