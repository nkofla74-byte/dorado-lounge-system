import { describe, it, expect } from 'vitest';
import { esRutaPublica } from '../rutas-publicas';

// Regresión de F-029: el predicado era `pathname.startsWith(p)` a secas.
describe('esRutaPublica', () => {
  it('acepta la ruta exacta', () => {
    for (const ruta of ['/login', '/qr', '/health', '/api/heartbeat', '/api/cron']) {
      expect(esRutaPublica(ruta)).toBe(true);
    }
  });

  it('acepta subrutas y query strings', () => {
    expect(esRutaPublica('/qr/es')).toBe(true);
    expect(esRutaPublica('/api/cron/check-alertas')).toBe(true);
    expect(esRutaPublica('/login?next=/inventario')).toBe(true);
  });

  it('no acepta rutas que solo comparten prefijo de cadena', () => {
    for (const ruta of ['/loginX', '/healthz', '/qrcodes', '/api/cronjobs', '/api/heartbeats']) {
      expect(esRutaPublica(ruta)).toBe(false);
    }
  });

  it('no acepta rutas privadas', () => {
    for (const ruta of ['/inventario', '/admin/tenants', '/cocina-fria']) {
      expect(esRutaPublica(ruta)).toBe(false);
    }
  });
});
