import { test, expect } from '@playwright/test';

test('muestra la lista de recetas', async ({ page }) => {
  await page.goto('/recetas');
  await expect(page.getByRole('heading', { name: /recetas/i })).toBeVisible();
});

test('muestra el KDS de cocina', async ({ page }) => {
  await page.goto('/cocina');
  await expect(page).toHaveURL(/cocina/);
});
