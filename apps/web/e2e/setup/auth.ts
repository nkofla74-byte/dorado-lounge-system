import { test as setup } from '@playwright/test';
import path from 'path';

const adminFile = path.join(__dirname, '../.auth/admin.json');

setup('autenticar admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/correo/i).fill('admin@dorado.test');
  await page.getByLabel(/contraseña/i).fill('dorado2025!');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL('**/inventario');
  await page.context().storageState({ path: adminFile });
});
