import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      // El alcance anterior era solo `src/modules/*/domain/**`: el umbral se
      // calculaba sobre una fracción pequeña del código ejecutable y dejaba
      // fuera precisamente donde estaban los hallazgos graves de la auditoría
      // 2026-08-22 (autorización, Server Actions, camino QR). F-023.
      include: [
        'src/modules/*/domain/**',
        'src/modules/*/application/**',
        'src/lib/auth/**',
        'src/lib/security/**',
        'src/lib/audit.ts',
        'src/lib/result.ts',
        'src/lib/turnos.ts',
        'src/lib/units.ts',
      ],
      exclude: ['**/*.test.ts', '**/tests/**'],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
        // Merma es el algoritmo más crítico del sistema (Principio Rector).
        'src/modules/inventory/domain/merma.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
