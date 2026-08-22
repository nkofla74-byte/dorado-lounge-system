// Content-Security-Policy por petición.
//
// F-019 — La CSP vivía en next.config.mjs, que solo admite cabeceras estáticas,
// así que la rama de producción incluía 'unsafe-inline' en script-src para poder
// ejecutar los scripts inline que inyecta el App Router. Con 'unsafe-inline' y
// sin nonce ni hash, la CSP deja de ser una barrera contra XSS.
//
// Al construirla en el middleware podemos emitir un nonce distinto por respuesta
// y usar 'strict-dynamic', que es lo que hace que la directiva sirva de algo.

export function generarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

interface OpcionesCsp {
  nonce: string;
  supabaseUrl: string | undefined;
  socketUrl: string | undefined;
  esProduccion: boolean;
}

function hostDe(url: string | undefined, porDefecto: string): string {
  if (!url) return porDefecto;
  try {
    return new URL(url).host;
  } catch {
    return porDefecto;
  }
}

export function construirCsp({ nonce, supabaseUrl, socketUrl, esProduccion }: OpcionesCsp): string {
  const supabaseHost = hostDe(supabaseUrl, '*.supabase.co');
  const socket = socketUrl ?? 'http://localhost:3001';
  const socketHost = hostDe(socket, 'localhost:3001');
  const socketConnectSrc = socket.startsWith('https:')
    ? [`https://${socketHost}`, `wss://${socketHost}`]
    : [`http://${socketHost}`, `ws://${socketHost}`];

  // 'strict-dynamic' permite que los scripts cargados por uno con nonce válido
  // se ejecuten sin necesitar el suyo, que es como funciona el runtime de Next.
  // El 'unsafe-inline' que le sigue es un repliegue para navegadores que no
  // entienden 'strict-dynamic'; los que sí, lo ignoran.
  // En desarrollo se conserva 'unsafe-eval' para el HMR.
  const scriptSrc = esProduccion
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    [
      'connect-src',
      "'self'",
      `https://${supabaseHost}`,
      `wss://${supabaseHost}`,
      ...socketConnectSrc,
      'https://challenges.cloudflare.com',
      'https://*.ingest.sentry.io',
      'https://*.axiom.co',
      'https://in.logs.betterstack.com',
      'https://betteruptime.com',
    ].join(' '),
    "font-src 'self' data:",
    "img-src 'self' data: https:",
    'frame-src https://challenges.cloudflare.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(esProduccion ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
