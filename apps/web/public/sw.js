// Service Worker — Dorado Lounge QR PWA
// Scope: /qr/ — solo activo en las rutas del pasajero

const CACHE_NAME = 'dorado-qr-v1';

// Install: activar inmediatamente sin esperar a que cierren pestañas anteriores
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: limpiar versiones de caché anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch strategy:
//   /_next/static/ e /icons/ → cache-first (assets inmutables con hash)
//   Todo lo demás (HTML páginas, Server Actions) → network-first
//   Fallback offline: página mínima en español/inglés si no hay red ni caché
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar GET dentro del mismo origen
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest';

  if (isStaticAsset) {
    // Cache-first para assets estáticos con hash de contenido
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Network-first para páginas y API (datos dinámicos)
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Guardar en caché páginas /qr/ para fallback offline
        if (response.ok && url.pathname.startsWith('/qr/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Sin red: devolver caché si existe, sino página de error offline
        caches.match(request).then(
          (cached) =>
            cached ||
            new Response(
              `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Dorado Lounge — Sin conexión</title>
  <style>
    body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
         background:#016FD0;color:#fff;font-family:Arial,sans-serif;text-align:center;padding:2rem}
    h1{font-size:2rem;font-weight:900;margin:0 0 .5rem}
    p{opacity:.75;font-size:.95rem;margin:0}
  </style>
</head>
<body>
  <div>
    <h1>Dorado Lounge</h1>
    <p>Sin conexión. Conéctate a internet para continuar.</p>
    <p style="margin-top:1rem;font-size:.8rem;opacity:.5">No connection · Pas de connexion · Sem conexão</p>
  </div>
</body>
</html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            ),
        ),
      ),
  );
});
