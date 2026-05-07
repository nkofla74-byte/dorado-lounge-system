import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/qr'];

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

  // Usuario autenticado en /login → mandar al dashboard.
  // OJO: /qr/* es público para pasajeros y NO debe redirigir nunca, aunque
  // el admin esté logueado en el mismo navegador.
  if (user && isLoginPath) {
    const role = user.app_metadata?.role as string | undefined;
    const tenantId = user.app_metadata?.tenant_id as string | undefined;
    if (role && tenantId) {
      const next = request.nextUrl.searchParams.get('next') ?? '/inventario';
      const url = request.nextUrl.clone();
      url.pathname = next;
      url.searchParams.delete('next');
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
