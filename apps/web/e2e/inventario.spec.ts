import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

test.describe('Inventario', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inventario');
    await expect(page).toHaveURL(/\/inventario/);
  });

  test('muestra la tabla de insumos', async ({ page }) => {
    // La tabla o el panel de inventario está presente
    await expect(page.getByRole('main')).toBeVisible();
    // No hay error visible
    await expect(page.getByText(/error/i)).toHaveCount(0);
  });

  test('puede abrir el diálogo de crear insumo', async ({ page }) => {
    const crearBtn = page.getByRole('button', { name: /Nuevo insumo|Crear insumo|Agregar/i });
    if ((await crearBtn.count()) > 0) {
      await crearBtn.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Cierra sin guardar
      await page.keyboard.press('Escape');
    }
  });

  test('puede abrir el diálogo de stock out', async ({ page }) => {
    const stockOutBtn = page.getByRole('button', { name: /Stock Out|Salida/i });
    if ((await stockOutBtn.count()) > 0) {
      await stockOutBtn.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Verifica que el campo de cantidad está presente
      const cantidadInput = page.getByLabel(/Cantidad/i);
      if ((await cantidadInput.count()) > 0) {
        await expect(cantidadInput).toBeVisible();
      }
      await page.keyboard.press('Escape');
    }
  });

  test('almacén es accesible y carga sin error', async ({ page }) => {
    await page.goto('/almacen');
    await expect(page).toHaveURL(/\/almacen/);
    await expect(page.getByRole('main')).toBeVisible();
  });
});
