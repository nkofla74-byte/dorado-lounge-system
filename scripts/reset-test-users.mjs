/**
 * Reconcilia el set canónico de usuarios de prueba contra el estado actual de Supabase.
 *
 * Garantiza que existan exactamente estos 11 usuarios, todos con password Admin123:
 *   - superuser@gisat.com (rol superuser, tenant "plataforma")
 *   - admin@gisat.com + 10 roles operativos (tenant "dorado-lounge")
 *
 * Pasos:
 *   1. Limpia el tenant legacy "dorado-demo" + admin@dorado.test si quedaron.
 *   2. Crea cualquier usuario faltante del set canónico.
 *   3. Resetea password + app_metadata (role, tenant_id) en los existentes.
 *   4. No toca pipe@gisat.com (cuenta personal del desarrollador).
 *
 * Idempotente: corre las veces que quieras.
 *
 * Uso:
 *   pnpm reset:test-users
 *   # equivalente a: node --env-file=apps/web/.env.local scripts/reset-test-users.mjs
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

const PASSWORD = 'Admin123';

const TENANT_OPERATIVO_SLUG = 'dorado-lounge';
const TENANT_PLATAFORMA_SLUG = 'plataforma';
const TENANT_DEMO_SLUG = 'dorado-demo'; // a borrar
const PROTECTED_EMAIL = 'pipe@gisat.com';

// Set de test: 11 usuarios, uno por rol del enum
const TEST_USERS = [
  {
    email: 'superuser@gisat.com',
    nombre: 'Superuser Plataforma',
    role: 'superuser',
    tenantSlug: TENANT_PLATAFORMA_SLUG,
  },
  {
    email: 'admin@gisat.com',
    nombre: 'Administrador GISAT',
    role: 'admin',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'chef@dorado.test',
    nombre: 'Chef Principal',
    role: 'chef',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'soushef@dorado.test',
    nombre: 'Sous Chef',
    role: 'sous_chef',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'mesero@dorado.test',
    nombre: 'Mesero Amex',
    role: 'mesero_amex',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'recepcion@dorado.test',
    nombre: 'Recepción',
    role: 'recepcion',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'snack@dorado.test',
    nombre: 'Personal Snack',
    role: 'personal_snack',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'buffet@dorado.test',
    nombre: 'Personal Buffet',
    role: 'personal_buffet',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'almacen@dorado.test',
    nombre: 'Personal Almacén',
    role: 'personal_almacen',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'pasteleria@dorado.test',
    nombre: 'Personal Pastelería',
    role: 'personal_pasteleria',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'steward@dorado.test',
    nombre: 'Steward',
    role: 'steward',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
];

async function main() {
  // ── 1. Obtener mapas de tenants ──────────────────────────────────────────
  const { data: tenants, error: tErr } = await admin.from('tenants').select('id, slug, activo');
  if (tErr) throw new Error(`Error listando tenants: ${tErr.message}`);
  const tenantBySlug = new Map(tenants.map((t) => [t.slug, t]));

  const tenantOp = tenantBySlug.get(TENANT_OPERATIVO_SLUG);
  const tenantPlat = tenantBySlug.get(TENANT_PLATAFORMA_SLUG);
  if (!tenantOp) throw new Error('Falta tenant operativo "dorado-lounge"');
  if (!tenantPlat) throw new Error('Falta tenant "plataforma"');

  // ── 2. Listar auth users ─────────────────────────────────────────────────
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authByEmail = new Map((authList?.users ?? []).map((u) => [u.email, u]));

  // ── 3. Borrar admin@dorado.test (mi error) ───────────────────────────────
  const stray = authByEmail.get('admin@dorado.test');
  if (stray) {
    await admin.from('users').delete().eq('id', stray.id);
    const { error } = await admin.auth.admin.deleteUser(stray.id);
    if (error) console.error(`✗ No se pudo borrar admin@dorado.test: ${error.message}`);
    else console.log('🗑  admin@dorado.test (auth + public.users)');
    authByEmail.delete('admin@dorado.test');
  }

  // ── 4. Borrar tenant dorado-demo si no tiene usuarios ────────────────────
  const tenantDemo = tenantBySlug.get(TENANT_DEMO_SLUG);
  if (tenantDemo) {
    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantDemo.id);
    if ((count ?? 0) === 0) {
      const { error } = await admin.from('tenants').delete().eq('id', tenantDemo.id);
      if (error) console.error(`✗ No se pudo borrar tenant dorado-demo: ${error.message}`);
      else console.log(`🗑  tenant ${TENANT_DEMO_SLUG}`);
    } else {
      console.log(`⏭  tenant ${TENANT_DEMO_SLUG} todavía tiene ${count} usuarios — no se borra`);
    }
  }

  // ── 5. Procesar test users ───────────────────────────────────────────────
  console.log('\n── Procesando test users ──\n');

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const u of TEST_USERS) {
    const tenant = tenantBySlug.get(u.tenantSlug);
    if (!tenant) {
      console.error(`✗ ${u.email}: tenant ${u.tenantSlug} no encontrado`);
      errors++;
      continue;
    }

    const existing = authByEmail.get(u.email);

    if (existing) {
      // Reset password + asegurar app_metadata + sincronizar public.users
      const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { role: u.role, tenant_id: tenant.id },
      });
      if (updErr) {
        console.error(`✗ ${u.email}: ${updErr.message}`);
        errors++;
        continue;
      }
      const { error: pubErr } = await admin.from('users').upsert(
        {
          id: existing.id,
          tenant_id: tenant.id,
          nombre: u.nombre,
          role: u.role,
          activo: true,
        },
        { onConflict: 'id' },
      );
      if (pubErr) {
        console.error(`✗ ${u.email} (public.users): ${pubErr.message}`);
        errors++;
        continue;
      }
      updated++;
      console.log(`🔁 ${u.role.padEnd(22)} ${u.email}`);
    } else {
      const { data: createdAuth, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { role: u.role, tenant_id: tenant.id },
      });
      if (createErr || !createdAuth.user) {
        console.error(`✗ ${u.email}: ${createErr?.message ?? 'sin user devuelto'}`);
        errors++;
        continue;
      }
      const { error: pubErr } = await admin.from('users').upsert(
        {
          id: createdAuth.user.id,
          tenant_id: tenant.id,
          nombre: u.nombre,
          role: u.role,
          activo: true,
        },
        { onConflict: 'id' },
      );
      if (pubErr) {
        console.error(`✗ ${u.email} (public.users): ${pubErr.message}`);
        errors++;
        continue;
      }
      created++;
      console.log(`✨ ${u.role.padEnd(22)} ${u.email}`);
    }
  }

  // ── 6. Verificar pipe@gisat.com intacto ──────────────────────────────────
  if (authByEmail.has(PROTECTED_EMAIL)) {
    console.log(`\n🛡  ${PROTECTED_EMAIL} se mantuvo intacto (cuenta personal).`);
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`Contraseña común para los 11 test users: ${PASSWORD}`);
  console.log(`Creados: ${created}  ·  Reseteados: ${updated}  ·  Errores: ${errors}`);
  console.log('────────────────────────────────────────────────────\n');

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
