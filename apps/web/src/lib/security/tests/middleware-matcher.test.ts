import { describe, it, expect } from 'vitest';
import { config } from '@/middleware';

// Regresión: el matcher excluía las imágenes de `public/` pero no el resto de
// ficheros estáticos. El navegador pide el manifest y el service worker SIN
// cookies, así que el middleware los tomaba por anónimos y los redirigía a
// /login: llegaba HTML donde se esperaba JSON o JavaScript. Eso rompía el
// manifest de los dos PWA y el registro de /sw.js — el modo offline del QR de
// pasajeros — sin que nada fallara en voz alta.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('matcher del middleware', () => {
  it('deja pasar los ficheros estáticos de public/ sin guardia de sesión', () => {
    for (const ruta of [
      '/staff-manifest.webmanifest',
      '/manifest.webmanifest',
      '/sw.js',
      '/favicon.ico',
      '/icons/icon-192.png',
      '/robots.txt',
      '/sitemap.xml',
      '/arrozcocofrito.jpg',
    ]) {
      expect(matcher.test(ruta), `${ruta} no debería pasar por el middleware`).toBe(false);
    }
  });

  it('sigue guardando las rutas de la aplicación', () => {
    for (const ruta of [
      '/inventario',
      '/almacen',
      '/cocina-caliente',
      '/admin/tenants',
      '/qr/es',
      '/login',
      '/',
    ]) {
      expect(matcher.test(ruta), `${ruta} debería pasar por el middleware`).toBe(true);
    }
  });
});
