import { test, expect } from '@playwright/test';

test('muestra la lista de insumos', async ({ page }) => {
  await page.goto('/inventario');
  await expect(page.getByRole('heading', { name: /inventario|insumos/i })).toBeVisible();
});

test('puede navegar a la página de almacén', async ({ page }) => {
  await page.goto('/almacen');
  await expect(page).toHaveURL(/almacen/);
});
