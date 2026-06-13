/**
 * Reconcilia el set canónico de usuarios de prueba contra el estado actual de Supabase.
 *
 * Garantiza que existan exactamente estos 12 usuarios, todos con password Admin123,
 * todos en el tenant operativo "dorado-lounge":
 *   - superuser@gisat.com (rol superuser — bypass total, prepara apertura a más tenants)
 *   - admin@gisat.com + 9 roles operativos
 *
 * Pasos:
 *   1. Limpieza idempotente de legacy: tenants "dorado-demo"/"plataforma" sin usuarios,
 *      usuarios huérfanos admin@dorado.test / pipe@gisat.com si reaparecieran.
 *   2. Crea cualquier usuario faltante del set canónico.
 *   3. Resetea password + app_metadata (role, tenant_id) en los existentes.
 *
 * Idempotente: corre las veces que quieras.
 *
 * Uso:
 *   pnpm reset:test-users
 *   # equivalente a: node --env-file=apps/web/.env.local scripts/reset-test-users.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// El paquete @supabase/supabase-js vive en apps/web/node_modules (no en root),
// así que resolvemos contra el package.json de la app web para que el script
// funcione invocado desde cualquier cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(path.resolve(here, '..', 'apps', 'web', 'package.json'));
const { createClient } = requireFromWeb('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (
  !SUPABASE_URL.includes('localhost') &&
  !SUPABASE_URL.includes('127.0.0.1') &&
  process.env.ALLOW_PRODUCTION_RESET !== 'yes_i_know'
) {
  console.error(
    '✗ SAFETY: Este script modifica usuarios. Solo ejecutar contra bases de datos locales o de staging.',
  );
  console.error(
    '  Si realmente necesitas ejecutarlo contra producción, exporta ALLOW_PRODUCTION_RESET=yes_i_know',
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Admin123';

const TENANT_OPERATIVO_SLUG = 'dorado-lounge';
const LEGACY_TENANT_SLUGS = ['dorado-demo', 'plataforma']; // se borran si quedan vacíos
const LEGACY_EMAILS = ['admin@dorado.test', 'pipe@gisat.com', 'recepcion@dorado.test']; // se borran si reaparecen

// Set de test: 12 usuarios, todos en el tenant operativo.
const TEST_USERS = [
  {
    email: 'superuser@gisat.com',
    nombre: 'Superuser Plataforma',
    role: 'superuser',
    tenantSlug: TENANT_OPERATIVO_SLUG,
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
    email: 'cocinafria@dorado.test',
    nombre: 'Chef Cocina Fría',
    role: 'chef_cocina_fria',
    tenantSlug: TENANT_OPERATIVO_SLUG,
  },
  {
    email: 'cocinacaliente@dorado.test',
    nombre: 'Chef Cocina Caliente',
    role: 'chef_cocina_caliente',
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
  if (!tenantOp) throw new Error('Falta tenant operativo "dorado-lounge"');

  // ── 2. Listar auth users ─────────────────────────────────────────────────
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authByEmail = new Map((authList?.users ?? []).map((u) => [u.email, u]));

  // ── 3. Borrar emails legacy si reaparecieran ─────────────────────────────
  for (const email of LEGACY_EMAILS) {
    const stray = authByEmail.get(email);
    if (!stray) continue;
    await admin.from('users').delete().eq('id', stray.id);
    const { error } = await admin.auth.admin.deleteUser(stray.id);
    if (error) console.error(`✗ No se pudo borrar ${email}: ${error.message}`);
    else console.log(`🗑  ${email} (auth + public.users)`);
    authByEmail.delete(email);
  }

  // ── 4. Borrar tenants legacy si quedan vacíos ────────────────────────────
  for (const slug of LEGACY_TENANT_SLUGS) {
    const t = tenantBySlug.get(slug);
    if (!t) continue;
    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', t.id);
    if ((count ?? 0) > 0) {
      console.log(`⏭  tenant ${slug} todavía tiene ${count} usuarios — no se borra`);
      continue;
    }
    // Limpiar receta(s) huérfana(s) antes de tirar el tenant
    await admin.from('recetas').delete().eq('tenant_id', t.id);
    const { error } = await admin.from('tenants').delete().eq('id', t.id);
    if (error) console.error(`✗ No se pudo borrar tenant ${slug}: ${error.message}`);
    else console.log(`🗑  tenant ${slug}`);
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

  console.log('\n────────────────────────────────────────────────────');
  console.log(`Contraseña común para los ${TEST_USERS.length} test users: ${PASSWORD}`);
  console.log(`Creados: ${created}  ·  Reseteados: ${updated}  ·  Errores: ${errors}`);
  console.log('────────────────────────────────────────────────────\n');

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
