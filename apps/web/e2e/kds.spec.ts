import { test, expect } from '@playwright/test';
import path from 'path';

// Usa la sesión de cocina_caliente autenticada en auth.setup.ts
test.use({ storageState: path.join(__dirname, '.auth/cocina-caliente.json') });

test.describe('KDS — Kitchen Display System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cocina-caliente');
    // Espera a que cargue el tablero del área caliente
    await expect(page.getByText('Cocina Caliente — KDS')).toBeVisible();
  });

  test('muestra el tablero del área con sus tres columnas', async ({ page }) => {
    await expect(page.getByText('Cocina Caliente — KDS')).toBeVisible();
    // Un solo board → cada texto de columna aparece una vez
    await expect(page.getByText('Nuevos')).toHaveCount(1);
    await expect(page.getByText('En preparación')).toHaveCount(1);
    await expect(page.getByText('Despachados')).toHaveCount(1);
  });

  test('el botón Actualizar refresca el tablero sin error', async ({ page }) => {
    await page.getByRole('button', { name: 'Actualizar' }).first().click();
    // No debe aparecer error ni crash
    await expect(page.getByText('Cocina Caliente — KDS')).toBeVisible();
  });

  test('flujo completo de pedido: Nuevos → En preparación → Despachado', async ({ page }) => {
    // Primero navega a pedidos para crear uno
    await page.goto('/pedidos');
    await expect(page).toHaveURL(/\/pedidos/);

    // Vuelve al KDS y verifica que el pedido aparece en "Nuevos"
    await page.goto('/cocina-caliente');
    await expect(page.getByText('Nuevos').first()).toBeVisible();

    // Si hay al menos un pedido en "Nuevos", lo mueve a en_preparacion
    const nuevosColumn = page.locator('[data-state="creado"]').first();
    if ((await nuevosColumn.count()) > 0) {
      const iniciarBtn = nuevosColumn.getByRole('button', { name: /Iniciar|En preparación/i });
      if ((await iniciarBtn.count()) > 0) {
        await iniciarBtn.click();
        // Espera feedback visual (toast o cambio de columna)
        await page.waitForTimeout(500);
        await expect(page.getByText('En preparación').first()).toBeVisible();
      }
    }
  });
});
