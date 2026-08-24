import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Auditoría de contraste WCAG sobre los tokens de globals.css.
//
// Nació de un fallo propio: durante el rediseño afirmé que la paleta cumplía
// AA sin haberlo medido nunca. Al medirlo aparecieron dos incumplimientos en
// tema claro — `senal-aviso` daba 3,67 sobre el fondo, y los iconos de cocina
// de la barra lateral daban 1,87, prácticamente invisibles.
//
// Esta prueba lee los tokens reales del CSS, así que no se puede quedar
// desfasada respecto a ellos.

const CSS = readFileSync(join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf-8');

type Hsl = [number, number, number];

function tokensDe(selector: string): Record<string, Hsl> {
  const bloque = new RegExp(`${selector}\\s*\\{(.*?)\\n  \\}`, 's');
  const salida: Record<string, Hsl> = {};
  for (const m of CSS.matchAll(new RegExp(bloque.source, 'gs'))) {
    for (const [, k, h, s, l] of m[1]!.matchAll(
      /--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%;/g,
    )) {
      salida[k!] = [Number(h), Number(s), Number(l)];
    }
  }
  return salida;
}

function aRgb([h, s, l]: Hsl): [number, number, number] {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const base: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [r, g, b] = base[Math.floor(h / 60) % 6]!;
  return [r! + m, g! + m, b! + m];
}

function luminancia(hsl: Hsl): number {
  const lineal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = aRgb(hsl).map(lineal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: Hsl, b: Hsl): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CLARO = tokensDe(':root');
const OSCURO = { ...CLARO, ...tokensDe('\\.dark') };

// [color, fondo, para qué]. Todos son texto o iconografía con significado:
// el umbral que aplica es AA 4.5:1.
const PARES: [string, string, string][] = [
  ['foreground', 'background', 'texto principal'],
  ['muted-foreground', 'background', 'texto secundario'],
  ['card-foreground', 'card', 'texto sobre tarjeta'],
  ['senal-aviso', 'background', 'aviso'],
  ['senal-curso', 'background', 'en curso'],
  ['senal-ok', 'background', 'correcto'],
  ['senal-critico', 'background', 'crítico'],
  ['area-almacen', 'sidebar', 'icono de almacén'],
  ['area-cocina', 'sidebar', 'icono de cocina'],
  ['area-sala', 'sidebar', 'icono de sala'],
  ['zona-amex', 'card', 'zona Dorado Prefer'],
  ['zona-buffet', 'card', 'zona buffet'],
  ['zona-snack', 'card', 'zona snack'],
];

describe.each([
  ['claro', CLARO],
  ['oscuro', OSCURO],
])('contraste AA — tema %s', (_tema, tokens) => {
  it.each(PARES)('%s sobre %s (%s) llega a 4.5:1', (fg, bg) => {
    const a = tokens[fg];
    const b = tokens[bg];
    expect(a, `falta el token --${fg}`).toBeDefined();
    expect(b, `falta el token --${bg}`).toBeDefined();
    expect(contraste(a!, b!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('contraste AA — carta del pasajero (Dorado Prefer)', () => {
  // Esta superficie fuerza fondo claro, así que sus tokens no tienen variante
  // oscura y se miden siempre contra su propio papel.
  it.each([
    ['prefer-tinta', 'texto de la carta'],
    ['prefer-acento', 'acento: precios, nombres de plato, botones'],
  ])('%s (%s) llega a 4.5:1', (fg) => {
    expect(contraste(CLARO[fg]!, CLARO['prefer-papel']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('prefer-oro NO llega a 4.5 y por eso está reservado a relleno', () => {
    // Documenta la decisión: si algún día alguien lo usa para texto, esta
    // prueba explica por qué no debe.
    expect(contraste(CLARO['prefer-oro']!, CLARO['prefer-papel']!)).toBeLessThan(4.5);
  });
});
