import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente para Server Components, Server Actions y Route Handlers.
// Usa anon key + cookies de sesión del usuario.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // En Server Components las cookies solo se pueden escribir
            // desde Server Actions o Route Handlers — ignorar silenciosamente.
          }
        },
      },
    },
  );
}
