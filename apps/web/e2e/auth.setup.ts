import { test as setup, expect } from '@playwright/test';
import path from 'path';

// Archivos donde se guarda la sesión autenticada por rol
export const ADMIN_AUTH = path.join(__dirname, '.auth/admin.json');
export const CHEF_AUTH = path.join(__dirname, '.auth/chef.json');

setup('autenticar admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  // Espera a llegar al dashboard
  await expect(page).toHaveURL(/\/(inventario|cocina|pedidos|snack|buffet|almacen|produccion)/);
  await page.context().storageState({ path: ADMIN_AUTH });
});

setup('autenticar chef', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(process.env.E2E_CHEF_EMAIL!);
  await page.getByLabel('Contraseña').fill(process.env.E2E_CHEF_PASSWORD!);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page).toHaveURL(/\/cocina/);
  await page.context().storageState({ path: CHEF_AUTH });
});
