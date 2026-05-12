import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // los tests comparten estado de DB en staging
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
  },

  projects: [
    // Setup: autentica y guarda storageState por rol
    { name: 'setup', testMatch: /.*\.setup\.ts/ },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  // Levanta Next.js en dev al correr localmente (en CI el proceso ya está corriendo)
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }),
});
