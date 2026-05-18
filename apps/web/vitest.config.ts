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
      // Solo medimos dominio puro — la infraestructura (Supabase clients)
      // requiere mocks pesados que no aportan al test de invariantes.
      include: ['src/modules/*/domain/**', 'src/lib/audit.ts', 'src/lib/result.ts'],
      exclude: ['**/*.test.ts', '**/tests/**'],
      thresholds: {
        // Threshold global suave (60%): muchos archivos de dominio aún sin
        // cubrir (analytics, insumo, recipe, snack/buffet despachos).
        // El threshold por archivo crítico (merma 90%) sigue siendo el gate duro.
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
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
