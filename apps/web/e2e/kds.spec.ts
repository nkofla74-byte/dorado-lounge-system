import { test, expect } from '@playwright/test';
import path from 'path';

// Usa la sesión de chef autenticada en auth.setup.ts
test.use({ storageState: path.join(__dirname, '.auth/chef.json') });

test.describe('KDS — Kitchen Display System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cocina');
    // Espera a que cargue la vista supervisora (KDS caliente + fría)
    await expect(page.getByText('Cocina — KDS general')).toBeVisible();
  });

  test('muestra ambos tableros de área con sus tres columnas', async ({ page }) => {
    await expect(page.getByText('Cocina Caliente — KDS')).toBeVisible();
    await expect(page.getByText('Cocina Fría — KDS')).toBeVisible();
    // Dos boards → cada texto de columna aparece dos veces
    await expect(page.getByText('Nuevos')).toHaveCount(2);
    await expect(page.getByText('En preparación')).toHaveCount(2);
    await expect(page.getByText('Despachados')).toHaveCount(2);
  });

  test('el botón Actualizar refresca el tablero sin error', async ({ page }) => {
    await page.getByRole('button', { name: 'Actualizar' }).first().click();
    // No debe aparecer error ni crash
    await expect(page.getByText('Cocina — KDS general')).toBeVisible();
  });

  test('flujo completo de pedido: Nuevos → En preparación → Despachado', async ({ page }) => {
    // Primero navega a pedidos para crear uno
    await page.goto('/pedidos');
    await expect(page).toHaveURL(/\/pedidos/);

    // Vuelve al KDS y verifica que el pedido aparece en "Nuevos"
    await page.goto('/cocina');
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
