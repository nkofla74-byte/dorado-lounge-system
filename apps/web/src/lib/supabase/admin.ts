import { createClient } from '@supabase/supabase-js';

// Cliente admin con service_role key.
// ÚNICAMENTE para Server Actions y Route Handlers internos.
// NUNCA importar desde componentes cliente ni exponer en NEXT_PUBLIC_*.
export function createAdminClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
