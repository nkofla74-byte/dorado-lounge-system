import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('redirige al dashboard tras login exitoso', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill('admin@dorado.test');
  await page.getByLabel(/contraseña/i).fill('dorado2025!');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).toHaveURL(/inventario/);
});

test('muestra error con credenciales incorrectas', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill('admin@dorado.test');
  await page.getByLabel(/contraseña/i).fill('password-malo');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/login/);
});

test('redirige /login a dashboard si ya está autenticado', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/inventario/);
});
