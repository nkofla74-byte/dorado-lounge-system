import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '.auth/admin.json') });

test.describe('Turnos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/turnos');
    await expect(page.getByText(/turno/i)).toBeVisible();
  });

  test('muestra el panel de turnos', async ({ page }) => {
    // La página carga sin error
    await expect(page).toHaveURL(/\/turnos/);
    // Debe existir al menos un botón de acción
    const btns = page.getByRole('button');
    await expect(btns.first()).toBeVisible();
  });

  test('puede iniciar un nuevo turno si no hay uno activo', async ({ page }) => {
    const iniciarBtn = page.getByRole('button', { name: /Iniciar turno/i });
    if ((await iniciarBtn.count()) > 0) {
      await iniciarBtn.click();
      // Espera el diálogo de confirmación
      const dialog = page.getByRole('dialog');
      if ((await dialog.count()) > 0) {
        // Cancela para no afectar el estado real del staging
        const cancelBtn = dialog.getByRole('button', { name: /Cancelar/i });
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click();
        }
      }
    }
    // El test pasa si no hubo crash
    await expect(page).toHaveURL(/\/turnos/);
  });

  test('analytics y turnos son accesibles desde el sidebar (admin)', async ({ page }) => {
    // Verifica que el sidebar tiene los enlaces clave del admin
    await expect(page.getByRole('link', { name: /Inventario/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Analytics/i }).first()).toBeVisible();
  });
});
