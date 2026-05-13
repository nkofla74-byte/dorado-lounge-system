/**
 * Crea un usuario de prueba por cada rol operacional en Supabase.
 *
 * Uso:
 *   node --env-file=apps/web/.env.local scripts/seed-test-users.mjs
 *
 * Requiere en el env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '✗ Faltan variables de entorno:\n  NEXT_PUBLIC_SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Configuración del tenant y contraseña de prueba ───────────────────────────

const TEST_TENANT = { nombre: 'Dorado Lounge Demo', slug: 'dorado-demo' };
const PASSWORD = 'Dorado2026!';

const USERS = [
  { nombre: 'Admin Demo', email: 'admin@dorado.test', role: 'admin' },
  { nombre: 'Chef Demo', email: 'chef@dorado.test', role: 'chef' },
  { nombre: 'Sous Chef Demo', email: 'souschef@dorado.test', role: 'sous_chef' },
  { nombre: 'Mesero Amex Demo', email: 'mesero@dorado.test', role: 'mesero_amex' },
  { nombre: 'Recepción Demo', email: 'recepcion@dorado.test', role: 'recepcion' },
  { nombre: 'Personal Snack Demo', email: 'snack@dorado.test', role: 'personal_snack' },
  { nombre: 'Personal Buffet Demo', email: 'buffet@dorado.test', role: 'personal_buffet' },
  { nombre: 'Personal Almacén Demo', email: 'almacen@dorado.test', role: 'personal_almacen' },
  {
    nombre: 'Personal Pastelería Demo',
    email: 'pasteleria@dorado.test',
    role: 'personal_pasteleria',
  },
  { nombre: 'Steward Demo', email: 'steward@dorado.test', role: 'steward' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Obtener o crear el tenant de prueba
  const { data: existing } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', TEST_TENANT.slug)
    .maybeSingle();

  let tenantId;
  if (existing) {
    tenantId = existing.id;
    console.log(`✓ Tenant existente: ${tenantId} (${TEST_TENANT.slug})`);
  } else {
    const { data: created, error } = await admin
      .from('tenants')
      .insert(TEST_TENANT)
      .select('id')
      .single();
    if (error) throw new Error(`Error creando tenant: ${error.message}`);
    tenantId = created.id;
    console.log(`✓ Tenant creado: ${tenantId} (${TEST_TENANT.slug})`);
  }

  // 2. Obtener lista de auth users para detectar duplicados
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existingEmails = new Set((authList?.users ?? []).map((u) => u.email));

  // 3. Crear usuarios
  console.log('\nCreando usuarios de prueba...\n');
  const results = [];

  for (const u of USERS) {
    if (existingEmails.has(u.email)) {
      console.log(`⚠  Ya existe: ${u.role.padEnd(22)} ${u.email}`);
      results.push({ ...u, status: 'existing' });
      continue;
    }

    try {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { tenant_id: tenantId, role: u.role },
      });
      if (authErr) throw authErr;

      const { error: dbErr } = await admin.from('users').insert({
        id: authData.user.id,
        tenant_id: tenantId,
        nombre: u.nombre,
        role: u.role,
        activo: true,
      });

      if (dbErr) {
        await admin.auth.admin.deleteUser(authData.user.id);
        throw dbErr;
      }

      console.log(`✓ ${u.role.padEnd(22)} ${u.email}`);
      results.push({ ...u, status: 'created' });
    } catch (err) {
      console.error(`✗ ${u.role.padEnd(22)} ${u.email} — ${err.message}`);
      results.push({ ...u, status: 'error', error: err.message });
    }
  }

  // 4. Resumen
  const created = results.filter((r) => r.status === 'created').length;
  const skipped = results.filter((r) => r.status === 'existing').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n────────────────────────────────────────────────────');
  console.log(`Contraseña común: ${PASSWORD}`);
  console.log(`Creados: ${created}  ·  Ya existían: ${skipped}  ·  Errores: ${errors}`);

  if (errors > 0) {
    console.log('\nRevisa los errores arriba — posibles causas:');
    console.log('  · El tipo user_role del enum no incluye el rol (revisar migraciones)');
    console.log('  · Conflicto de clave única en la tabla users');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nError fatal:', err.message);
  process.exit(1);
});
