import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/qr', '/health'];

/** Ruta de inicio por rol — espejo de app/page.tsx */
const ROLE_HOME: Record<string, string> = {
  superuser: '/admin/tenants',
  admin: '/inventario',
  chef: '/cocina',
  sous_chef: '/cocina',
  mesero_amex: '/pedidos',
  personal_snack: '/snack',
  personal_buffet: '/buffet',
  recepcion: '/pedidos',
  personal_almacen: '/almacen',
  personal_pasteleria: '/pasteleria',
  steward: '/produccion',
};

/**
 * ACL de rutas: prefijo → roles permitidos.
 * Orden importa: prefijos más específicos primero.
 * superuser tiene acceso total y no se evalúa aquí.
 */
const ROUTE_ACL: [string, string[]][] = [
  ['/admin/tenants', ['superuser']],
  ['/admin/personal', ['admin']],
  ['/admin/qr', ['admin', 'mesero_amex']],
  ['/almacen', ['personal_almacen']],
  [
    '/inventario',
    [
      'admin',
      'chef',
      'sous_chef',
      'personal_snack',
      'personal_buffet',
      'personal_pasteleria',
      'steward',
    ],
  ],
  ['/recetas', ['admin', 'chef', 'sous_chef', 'personal_pasteleria']],
  ['/cocina', ['admin', 'chef', 'sous_chef']],
  ['/produccion', ['admin', 'chef', 'sous_chef', 'personal_pasteleria', 'steward']],
  ['/pasteleria', ['admin', 'personal_pasteleria']],
  ['/pedidos', ['admin', 'mesero_amex', 'recepcion']],
  ['/buffet', ['admin', 'chef', 'sous_chef', 'personal_buffet']],
  ['/snack', ['admin', 'chef', 'sous_chef', 'personal_snack']],
  ['/turnos', ['admin', 'chef', 'sous_chef']],
  ['/afluencia', ['admin', 'chef', 'sous_chef', 'recepcion']],
  ['/analytics', ['admin']],
];

function getRoleHome(role: string): string {
  return ROLE_HOME[role] ?? '/inventario';
}

function canAccessRoute(pathname: string, role: string): boolean {
  if (role === 'superuser') return true;
  const entry = ROUTE_ACL.find(([prefix]) => pathname.startsWith(prefix));
  if (!entry) return true; // rutas sin ACL (ej: /) son accesibles
  return entry[1].includes(role);
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

  // Refresca la sesión si existe — obligatorio con @supabase/ssr
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isLoginPath = pathname.startsWith('/login');

  // Sin sesión → redirigir a login (excepto rutas públicas)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Usuario autenticado en /login → redirigir a su home por rol
  // No se redirige /qr/* aunque el admin esté logueado en el mismo navegador
  if (user && isLoginPath) {
    const role = user.app_metadata?.role as string | undefined;
    const tenantId = user.app_metadata?.tenant_id as string | undefined;
    if (role && tenantId) {
      const url = request.nextUrl.clone();
      url.pathname = getRoleHome(role);
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Usuario autenticado accediendo a ruta no permitida para su rol → su home
  if (user && !isPublicPath) {
    const role = user.app_metadata?.role as string | undefined;
    if (role && !canAccessRoute(pathname, role)) {
      const url = request.nextUrl.clone();
      url.pathname = getRoleHome(role);
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
