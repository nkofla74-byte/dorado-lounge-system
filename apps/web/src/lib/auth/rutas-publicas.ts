// Rutas accesibles sin sesión. Extraído de middleware.ts para poder probarlo:
// el predicado usaba `startsWith` a secas, así que /loginX o /healthz se
// consideraban públicas (F-029). Ninguna ruta colisionaba todavía, pero era una
// trampa latente para cualquier ruta futura con esos prefijos.
export const PUBLIC_PATHS = ['/login', '/qr', '/api/cron', '/api/heartbeat', '/health'] as const;

/** Coincidencia por segmento completo, no por prefijo de cadena. */
export function esRutaPublica(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`),
  );
}
