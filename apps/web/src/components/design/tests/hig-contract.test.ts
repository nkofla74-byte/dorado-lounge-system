import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Prueba de validación del stack de skills Apple HIG (`dorado-design-system`).
//
// ALCANCE: es una comprobación ESTÁTICA sobre el código fuente — verifica que
// la implementación de referencia sigue cumpliendo el contrato de diseño. No
// renderiza el componente ni sustituye a una auditoría de accesibilidad real
// con lector de pantalla.
//
// Su valor es de regresión: si alguien quita `motion-reduce`, baja un objetivo
// táctil o mete un hex suelto, esto falla.

const FUENTE = readFileSync(join(__dirname, '..', 'kds-order-card.tsx'), 'utf-8');

describe('contrato HIG — implementación de referencia del KDS', () => {
  it('usa lucide-react como iconografía, nunca SF Symbols embebidos', () => {
    expect(FUENTE).toMatch(/from 'lucide-react'/);
    // SF Symbols es una fuente con licencia de Apple: no puede embeberse en web.
    expect(FUENTE).not.toMatch(/SF Symbols|SFSymbol|sf-symbols\.woff/i);
  });

  it('escala la tipografía con rem/clamp (Dynamic Type), no con px fijos', () => {
    expect(FUENTE).toMatch(/clamp\([^)]*rem/);
    expect(FUENTE).not.toMatch(/fontSize:\s*'\d+px'/);
  });

  it('respeta objetivos táctiles de al menos 44 px (56 px en KDS)', () => {
    expect(FUENTE).toMatch(/min-h-14/); // 56px — se opera con guantes
    const objetivosPequenos = FUENTE.match(/min-h-(?:[0-9]|10)\b/g);
    expect(objetivosPequenos).toBeNull();
  });

  it('aplica material glass solo con fallback opaco', () => {
    expect(FUENTE).toMatch(/backdrop-blur/);
    expect(FUENTE).toMatch(/supports-\[backdrop-filter\]/);
  });

  it('usa colores semánticos, nunca un hex suelto', () => {
    expect(FUENTE).toMatch(/bg-card|text-muted-foreground|text-destructive/);
    expect(FUENTE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('no usa la paleta cruda de Tailwind, que ignora el tema', () => {
    // Esta aserción faltaba y por eso este mismo fichero se fue con
    // `text-emerald-600 dark:text-emerald-400`: dos colores fijos y una
    // variante manual de tema donde bastaba un token que ya se invierte solo.
    const crudos = FUENTE.match(
      /\b(?:bg|text|border|ring|from|to|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g,
    );
    expect(crudos).toBeNull();
  });

  it('anula la animación bajo prefers-reduced-motion', () => {
    const animaciones = FUENTE.match(/motion-safe:animate-\w+/g) ?? [];
    expect(animaciones.length).toBeGreaterThan(0);
    // Toda animación tiene su contrapartida explícita.
    expect(FUENTE).toMatch(/motion-reduce:animate-none/);
    expect(FUENTE).toMatch(/motion-reduce:transition-none/);
  });

  it('expone la interfaz a VoiceOver con ARIA y regiones vivas', () => {
    expect(FUENTE).toMatch(/aria-live="polite"/); // el cronómetro cambia solo
    expect(FUENTE).toMatch(/aria-label=/);
    expect(FUENTE).toMatch(/aria-labelledby=/);
    expect(FUENTE).toMatch(/aria-hidden/); // iconos decorativos
    expect(FUENTE).toMatch(/focus-visible:ring/); // navegable con teclado
  });

  it('mantiene el espaciado en la escala de 8 pt de Tailwind', () => {
    expect(FUENTE).toMatch(/\bgap-(?:2|3|4)\b/);
    // Nada de valores arbitrarios fuera de la retícula.
    expect(FUENTE).not.toMatch(/\b(?:gap|p|m)-\[\d+px\]/);
  });

  it('no escribe ninguna cadena de UI a mano (regla 7 de CLAUDE.md)', () => {
    expect(FUENTE).toMatch(/useTranslations\('higValidacion'\)/);
  });

  it('comunica el estado con más señales que el color', () => {
    // Cada estado tiene icono propio además de color: hay cocineros daltónicos.
    expect(FUENTE).toMatch(/ICONO_ESTADO/);
    expect(FUENTE).toMatch(/ESTILO_ESTADO/);
  });
});
