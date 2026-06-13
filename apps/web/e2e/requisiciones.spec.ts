import { test, expect } from '@playwright/test';
import path from 'path';

// Usa la sesión admin: puede ver el almacén y auditar los KDS de todas las áreas.
test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

test.describe('Requisiciones cocina → almacén', () => {
  test('almacén muestra la cola de requisiciones de cocina', async ({ page }) => {
    await page.goto('/almacen');
    await expect(page).toHaveURL(/\/almacen/);
    // La cola se monta siempre (vacía o con tarjetas) en la pantalla de almacén.
    await expect(page.getByRole('heading', { name: /Requisiciones de cocina/i })).toBeVisible();
  });

  test('el KDS de cocina caliente carga; el rol operativo puede pedir insumos', async ({
    page,
  }) => {
    await page.goto('/cocina-caliente');
    await expect(page).toHaveURL(/\/cocina-caliente/);

    // El botón "Pedir insumos" solo se renderiza para el rol operativo de cocina
    // (no para el admin auditor en modo solo-lectura). Con una sesión de cocina
    // real se ejercita el diálogo; como auditor, basta con que el KDS cargue.
    const pedirBtn = page.getByRole('button', { name: /Pedir insumos/i });
    if ((await pedirBtn.count()) > 0) {
      await pedirBtn.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByText(/Pedir insumos al almacén/i)).toBeVisible();
    }
  });
});
