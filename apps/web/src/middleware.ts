import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@dorado/shared-types';

const PUBLIC_PATHS = ['/login', '/qr', '/api/cron'];

// Ruta de inicio por rol — a dónde va el usuario al hacer login
const ROLE_HOME: Record<UserRole, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef: '/cocina',
  sous_chef: '/cocina-amex',
  mesero_amex: '/pedidos',
  recepcion: '/afluencia',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
  personal_almacen: '/almacen',
  personal_pasteleria: '/pasteleria',
  steward: '/produccion',
};

// Prefijos de ruta accesibles por rol (whitelist).
// superuser tiene acceso total; el resto solo ve lo que necesita.
// assertCan() en cada Server Action sigue siendo la autoridad final sobre escritura.
const ROLE_ALLOWED_PREFIXES: Record<UserRole, string[]> = {
  superuser: ['/'],
  admin: [
    '/inventario',
    '/almacen',
    '/recetas',
    '/produccion',
    '/pasteleria',
    '/pedidos',
    '/cocina',
    '/cocina-amex',
    '/buffet',
    '/snack',
    '/afluencia',
    '/analytics',
    '/admin',
    '/vuelos',
  ],
  chef: [
    '/cocina',
    '/produccion',
    '/pedidos',
    '/inventario',
    '/recetas',
    '/afluencia',
    '/snack',
    '/buffet',
    '/vuelos',
  ],
  sous_chef: [
    '/cocina-amex',
    '/produccion',
    '/pedidos',
    '/inventario',
    '/recetas',
    '/afluencia',
    '/vuelos',
  ],
  mesero_amex: ['/pedidos', '/vuelos'],
  recepcion: ['/afluencia', '/vuelos'],
  personal_snack: ['/snack', '/inventario'],
  personal_buffet: ['/buffet', '/inventario'],
  personal_almacen: ['/almacen', '/inventario', '/admin/proveedores'],
  personal_pasteleria: ['/pasteleria', '/produccion', '/recetas', '/inventario'],
  steward: ['/produccion', '/inventario'],
};

function canAccess(role: UserRole, pathname: string): boolean {
  const prefixes = ROLE_ALLOWED_PREFIXES[role];
  if (!prefixes) return false;
  return prefixes.some(
    (prefix) =>
      prefix === '/' ||
      pathname === prefix ||
      pathname.startsWith(prefix + '/') ||
      pathname.startsWith(prefix + '?'),
  );
}

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
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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
