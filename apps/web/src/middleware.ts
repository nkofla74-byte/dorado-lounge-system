import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@dorado/shared-types';
import { ROLE_HOME, canAccess } from '@/lib/auth/role-home';
import { esRutaPublica } from '@/lib/auth/rutas-publicas';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = esRutaPublica(pathname);
  const isLoginPath = pathname.startsWith('/login');

  // Sin sesión → redirigir a login (excepto rutas públicas).
  // Usar 302 (no 307) + no-store para evitar caché agresivo de Chrome móvil.
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    const res = NextResponse.redirect(url, 302);
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    return res;
  }

  if (user) {
    const role = user.app_metadata?.role as UserRole | undefined;
    const tenantId = user.app_metadata?.tenant_id as string | undefined;

    // Usuario con sesión inválida (sin rol/tenant) → limpiar cookies y redirigir a login.
    // Sin limpiar cookies se produce un redirect loop (user existe pero sin claims válidos).
    if (!role || !tenantId) {
      if (isLoginPath) return supabaseResponse;
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      const response = NextResponse.redirect(url, 302);
      response.headers.set('Cache-Control', 'no-store');
      request.cookies.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) response.cookies.delete(name);
      });
      return response;
    }

    if (isLoginPath) {
      const next = request.nextUrl.searchParams.get('next');
      const destination = next && canAccess(role, next) ? next : (ROLE_HOME[role] ?? '/inventario');
      const url = request.nextUrl.clone();
      url.pathname = destination;
      url.searchParams.delete('next');
      return NextResponse.redirect(url, 302);
    }

    if (!isPublicPath && !canAccess(role, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = ROLE_HOME[role] ?? '/inventario';
      return NextResponse.redirect(url, 302);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
