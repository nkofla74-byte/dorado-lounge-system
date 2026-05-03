/** @type {import('eslint').Linter.Config} */
const base = {
  rules: {},
};

/**
 * Reglas de fronteras hexagonales (ARCHITECTURE.md §16.2).
 * Aplicar en archivos dentro de modules/x/domain/** y modules/x/application/**
 * para impedir que importen de infrastructure/ o usen Supabase directamente.
 */
const hexagonalBoundaries = {
  files: [
    'src/modules/*/domain/**/*.ts',
    'src/modules/*/application/**/*.ts',
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/infrastructure/**'],
            message:
              'Violación hexagonal: domain/ y application/ no pueden importar de infrastructure/',
          },
          {
            group: ['@supabase/*'],
            message:
              'Solo infrastructure/ puede usar Supabase directamente',
          },
        ],
      },
    ],
  },
};

module.exports = { base, hexagonalBoundaries };
