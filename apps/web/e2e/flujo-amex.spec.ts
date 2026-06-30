import { test, expect, type Page } from '@playwright/test';

// Flujo total AMEX vía UI real: mesero crea → sous_chef despacha → mesero entrega
// (descuenta stock FEFO). Credenciales por env (dotted naming real de la base).
const PASS = process.env.E2E_PASSWORD ?? 'Admin123';
const MESERO = process.env.E2E_MESERO_AMEX_EMAIL ?? 'mesero.amex@dorado.test';
const SOUSCHEF = process.env.E2E_SOUSCHEF_EMAIL ?? 'cocina.amex@dorado.test';

// Los toasts de sonner se apilan sobre las cards del KDS y, con force-click,
// interceptan el clic. Los ocultamos para que el clic aterrice en el botón real.
async function hideToasts(page: Page) {
  await page.addStyleTag({
    content:
      '[data-sonner-toaster],[data-sonner-toast]{display:none!important;pointer-events:none!important}',
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

  // 1) Banner Habeas Data PRIMERO: es z-[100] (por encima del modal de turno) y
  //    si no se cierra intercepta el clic de "Abrir turno".
  const privacy = page.getByRole('dialog', { name: 'Aviso de privacidad' });
  await privacy.waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {});
  if (await privacy.isVisible().catch(() => false)) {
    await privacy.getByRole('button', { name: 'Aceptar' }).click({ force: true });
    await privacy.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  // 2) Modal bloqueante de turno (roles operativos): nombre = teamlider.
  const abrirTurno = page.getByRole('button', { name: 'Abrir turno' });
  await abrirTurno.waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {});
  for (let i = 0; i < 5; i++) {
    if (!(await abrirTurno.isVisible().catch(() => false))) break;
    await page
      .locator('#empleado-nombre')
      .fill(`E2E ${email.split('@')[0]}`)
      .catch(() => {});
    await abrirTurno.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  if (await abrirTurno.isVisible().catch(() => false)) {
    throw new Error(`No se pudo abrir turno para ${email}`);
  }
}

type Loc = ReturnType<Page['locator']>;

// El KDS re-renderiza cada card cada 1s → algunos force-clicks no disparan el
// onClick de React. Reintentamos hasta CONFIRMAR la transición: o aparece el
// botón/elemento esperado (`done`), o desaparece el botón clicado.
async function clickHasta(page: Page, getBtn: () => Loc, done: () => Loc, ms = 40_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if ((await done().count()) > 0) return;
    const btn = getBtn();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true, timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(1000);
    if ((await done().count()) > 0) return;
  }
  throw new Error('No se confirmó la transición esperada');
}

test('flujo total AMEX: crear → despachar → entregar (descuento FEFO)', async ({ browser }) => {
  test.setTimeout(180_000);
  const MESA = `E2E-AMEX-${Date.now().toString().slice(-6)}`;

  // ── 1. MESERO crea el pedido ──────────────────────────────────────────────
  const meseroCtx = await browser.newContext();
  const mesero = await meseroCtx.newPage();
  mesero.on('dialog', (d) => d.accept()); // confirm() nativo de entrega
  await login(mesero, MESERO, PASS);
  await mesero.goto('/pedidos');

  // setup: mesa + ver carta
  await mesero.getByLabel('Mesa').fill(MESA);
  await mesero.getByRole('button', { name: 'Ver carta' }).click();

  // agregar primer plato disponible
  const agregar = mesero.getByRole('button', { name: 'Agregar' }).first();
  await expect(agregar).toBeVisible({ timeout: 10_000 });
  await agregar.click();

  // enviar a cocina
  await mesero.getByRole('button', { name: /Enviar a cocina/i }).click();
  await expect(mesero.getByText(MESA).first()).toBeVisible({ timeout: 10_000 });
  console.log(`[E2E] pedido AMEX creado: ${MESA}`);

  // ── 2. SOUS_CHEF despacha en /cocina-amex ─────────────────────────────────
  const chefCtx = await browser.newContext();
  const chef = await chefCtx.newPage();
  await login(chef, SOUSCHEF, PASS);
  await chef.goto('/cocina-amex');
  await hideToasts(chef);

  // `div.bg-card` = card real del KDS (excluye toasts de sonner que repiten la mesa).
  const card = () => chef.locator('div.bg-card', { hasText: MESA }).first();
  await expect(card()).toBeVisible({ timeout: 15_000 });

  const btn = (txt: string) => card().locator('button', { hasText: txt });
  // creado → recibido_cocina (confirmado cuando aparece "Iniciar preparación")
  await clickHasta(
    chef,
    () => btn('Recibir en cocina'),
    () => btn('Iniciar preparación'),
  );
  // recibido_cocina → en_preparacion (confirmado cuando aparece "Despachar")
  await clickHasta(
    chef,
    () => btn('Iniciar preparación'),
    () => btn('Despachar'),
  );
  // en_preparacion → despachado (confirmado por el badge "Esperando … mesero")
  await clickHasta(
    chef,
    () => btn('Despachar'),
    () => card().getByText(/Esperando|mesero/i),
  );
  console.log(`[E2E] pedido AMEX despachado: ${MESA}`);

  // ── 3. MESERO confirma entrega (descuenta FEFO) ───────────────────────────
  await mesero.goto('/pedidos');
  await hideToasts(mesero);
  const row = () => mesero.locator('tr', { hasText: MESA }).first();
  await expect(row()).toBeVisible({ timeout: 15_000 });
  // despachado → entregado (descuenta FEFO). Reintenta hasta que la fila salga de la lista.
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if ((await mesero.getByText(MESA).count()) === 0) break;
    const btn = row().locator('button', { hasText: /Entregado|Confirmar entrega/ });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true, timeout: 1500 }).catch(() => {});
    }
    await mesero.waitForTimeout(1000);
  }
  await expect(mesero.getByText(MESA)).toHaveCount(0, { timeout: 10_000 });
  console.log(`[E2E] pedido AMEX entregado (FEFO aplicado): ${MESA}`);

  await meseroCtx.close();
  await chefCtx.close();
});
