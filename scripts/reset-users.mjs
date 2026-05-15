/**
 * Reset completo de usuarios: elimina todos los existentes y recrea
 * uno por cada rol del sistema con app_metadata correcto desde el inicio.
 *
 * Uso:
 *   node --env-file=apps/web/.env.local scripts/reset-users.mjs
 *
 * ⚠ DESTRUCTIVO — borra todos los usuarios de auth.users y public.users.
 *   Úsalo solo en entornos de desarrollo / staging.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TENANT = { nombre: 'Dorado Lounge', slug: 'dorado-lounge' };
const PASSWORD = 'Admin123';

// ── Usuarios a crear ──────────────────────────────────────────────────────────
// Un usuario por cada rol. Todos con password Admin123 (cambiar en producción).
const USERS = [
  {
    nombre: 'Administrador GISAT',
    email: 'admin@gisat.com',
    role: 'admin',
  },
  {
    nombre: 'Chef Principal',
    email: 'chef@dorado.test',
    role: 'chef',
  },
  {
    nombre: 'Sous Chef',
    email: 'soushef@dorado.test',
    role: 'sous_chef',
  },
  {
    nombre: 'Mesero Amex',
    email: 'mesero@dorado.test',
    role: 'mesero_amex',
  },
  {
    nombre: 'Recepción',
    email: 'recepcion@dorado.test',
    role: 'recepcion',
  },
  {
    nombre: 'Personal Snack',
    email: 'snack@dorado.test',
    role: 'personal_snack',
  },
  {
    nombre: 'Personal Buffet',
    email: 'buffet@dorado.test',
    role: 'personal_buffet',
  },
  {
    nombre: 'Personal Almacén',
    email: 'almacen@dorado.test',
    role: 'personal_almacen',
  },
  {
    nombre: 'Personal Pastelería',
    email: 'pasteleria@dorado.test',
    role: 'personal_pasteleria',
  },
  {
    nombre: 'Steward',
    email: 'steward@dorado.test',
    role: 'steward',
  },
];

async function main() {
  // ── 1. Eliminar todos los usuarios existentes ─────────────────────────────
  console.log('\n── Eliminando usuarios existentes...\n');
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = authList?.users ?? [];

  for (const u of existing) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) {
      console.error(`✗ No se pudo eliminar ${u.email}: ${error.message}`);
    } else {
      console.log(`  🗑  ${u.email}`);
    }
  }
  console.log(`\n  Eliminados: ${existing.length} usuario(s)\n`);

  // ── 2. Obtener o crear el tenant ──────────────────────────────────────────
  const { data: existingTenant } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', TENANT.slug)
    .maybeSingle();

  let tenantId;
  if (existingTenant) {
    tenantId = existingTenant.id;
    console.log(`── Tenant existente: ${tenantId}\n`);
  } else {
    const { data: newTenant, error } = await admin
      .from('tenants')
      .insert(TENANT)
      .select('id')
      .single();
    if (error) throw new Error(`Error creando tenant: ${error.message}`);
    tenantId = newTenant.id;
    console.log(`── Tenant creado: ${tenantId}\n`);
  }

  // ── 3. Crear usuarios frescos ─────────────────────────────────────────────
  console.log('── Creando usuarios...\n');
  const results = [];

  for (const u of USERS) {
    try {
      const { data: authData, error: authErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { tenant_id: tenantId, role: u.role },
        app_metadata: { tenant_id: tenantId, role: u.role },
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

      console.log(`  ✓ ${u.role.padEnd(22)} ${u.email}`);
      results.push({ ...u, status: 'ok' });
    } catch (err) {
      console.error(`  ✗ ${u.role.padEnd(22)} ${u.email} — ${err.message}`);
      results.push({ ...u, status: 'error' });
    }
  }

  // ── 4. Resumen ────────────────────────────────────────────────────────────
  const ok = results.filter((r) => r.status === 'ok').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log('\n════════════════════════════════════════════════════');
  console.log('  CREDENCIALES DE ACCESO');
  console.log('════════════════════════════════════════════════════');
  console.log(`  ${'Email'.padEnd(35)} Rol`);
  console.log(`  ${'─'.repeat(50)}`);
  for (const u of results.filter((r) => r.status === 'ok')) {
    console.log(`  ${u.email.padEnd(35)} ${u.role}`);
  }
  console.log(`\n  Contraseña común: ${PASSWORD}`);
  console.log(`  Tenant ID       : ${tenantId}`);
  console.log('════════════════════════════════════════════════════');
  console.log(`  Creados: ${ok}  ·  Errores: ${errors}`);

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nError fatal:', err.message);
  process.exit(1);
});
