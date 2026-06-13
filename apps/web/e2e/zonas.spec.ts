import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

test.describe('Vistas de zona snack/buffet', () => {
  test('admin puede auditar /snack y ver las pestañas de la zona', async ({ page }) => {
    await page.goto('/snack');
    await expect(page).toHaveURL(/\/snack/);
    await expect(page.getByRole('button', { name: /Pedidos activos/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Disponibilidad/i })).toBeVisible();
  });

  test('admin puede auditar /buffet y abrir el diálogo de pedido', async ({ page }) => {
    await page.goto('/buffet');
    await expect(page).toHaveURL(/\/buffet/);

    const nuevoBtn = page.getByRole('button', { name: /Nuevo pedido/i });
    if ((await nuevoBtn.count()) === 0) {
      // Sin credenciales E2E la sesión admin no existe y la vista no renderiza — skip.
      // Con credenciales presentes, la ausencia del botón es un fallo real.
      test.skip(!process.env['E2E_ADMIN_EMAIL'], 'requiere credenciales E2E');
      throw new Error('Botón "Nuevo pedido" no encontrado con credenciales E2E presentes');
    }
    await nuevoBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Pedir elaboraciones/i)).toBeVisible();
  });
});
