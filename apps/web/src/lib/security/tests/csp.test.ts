import { describe, it, expect } from 'vitest';
import { construirCsp, generarNonce } from '../csp';

// Regresión de F-019: la CSP de producción incluía 'unsafe-inline' en script-src
// sin nonce ni hash, lo que la reducía a poco más que un control de orígenes.

const BASE = {
  supabaseUrl: 'https://abc.supabase.co',
  socketUrl: 'https://socket.example.com',
};

describe('construirCsp', () => {
  it('incluye el nonce de la petición en script-src', () => {
    const csp = construirCsp({ ...BASE, nonce: 'NONCE123', esProduccion: true });
    expect(csp).toContain("'nonce-NONCE123'");
  });

  it('usa strict-dynamic en producción', () => {
    const csp = construirCsp({ ...BASE, nonce: 'n', esProduccion: true });
    expect(csp).toContain("'strict-dynamic'");
  });

  it('no permite unsafe-eval en producción', () => {
    const csp = construirCsp({ ...BASE, nonce: 'n', esProduccion: true });
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('mantiene las directivas de contención', () => {
    const csp = construirCsp({ ...BASE, nonce: 'n', esProduccion: true });
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('deriva los orígenes de conexión de las variables de entorno', () => {
    const csp = construirCsp({ ...BASE, nonce: 'n', esProduccion: true });
    expect(csp).toContain('https://abc.supabase.co');
    expect(csp).toContain('wss://abc.supabase.co');
    expect(csp).toContain('wss://socket.example.com');
  });

  it('usa ws:// cuando el socket no es seguro (desarrollo)', () => {
    const csp = construirCsp({
      ...BASE,
      socketUrl: 'http://localhost:3001',
      nonce: 'n',
      esProduccion: false,
    });
    expect(csp).toContain('ws://localhost:3001');
  });

  it('no revienta con una URL mal formada', () => {
    const csp = construirCsp({
      nonce: 'n',
      supabaseUrl: 'no-es-una-url',
      socketUrl: undefined,
      esProduccion: true,
    });
    expect(csp).toContain('*.supabase.co');
  });
});

describe('generarNonce', () => {
  it('produce un valor distinto en cada llamada', () => {
    const nonces = new Set(Array.from({ length: 50 }, generarNonce));
    expect(nonces.size).toBe(50);
  });

  it('produce base64 no vacío', () => {
    expect(generarNonce()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
