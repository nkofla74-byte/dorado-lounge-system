import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('credenciales inválidas muestran error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill('noexiste@gisat.com');
    await page.getByLabel('Contraseña').fill('wrongpassword');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('usuario sin sesión es redirigido al login', async ({ page }) => {
    await page.goto('/inventario');
    await expect(page).toHaveURL(/\/login\?next=%2Finventario/);
  });

  test('route guard: mesero_amex no puede acceder a /inventario', async ({ page }) => {
    // Este test requiere storageState de un mesero — asume que existe en .auth/mesero.json
    // Si no existe, el test se salta (entorno de staging con usuario real)
    const meseroAuthPath = './e2e/.auth/mesero.json';
    const fs = await import('fs');
    if (!fs.existsSync(meseroAuthPath)) {
      test.skip(true, 'requiere auth file de mesero (.auth/mesero.json)');
      return;
    }

    await page
      .context()
      .addCookies(JSON.parse(fs.readFileSync(meseroAuthPath, 'utf-8')).cookies ?? []);
    await page.goto('/inventario');
    // Debe redirigir al home del rol (pedidos)
    await expect(page).toHaveURL(/\/pedidos/);
  });

  test('login admin redirige a /inventario', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/inventario/);
  });

  test('login chef redirige a /cocina', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_CHEF_EMAIL!);
    await page.getByLabel('Contraseña').fill(process.env.E2E_CHEF_PASSWORD!);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/cocina/);
  });

  test('login mesero_amex redirige a /pedidos sin loop', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(process.env.E2E_MESERO_AMEX_EMAIL!);
    await page.getByLabel('Contraseña').fill(process.env.E2E_MESERO_AMEX_PASSWORD!);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/pedidos/);
    // Verificar que no hay loop: la URL no vuelve a /login
    await expect(page).not.toHaveURL(/\/login/);
  });
});
