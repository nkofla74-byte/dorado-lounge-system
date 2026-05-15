/**
 * Repara app_metadata de usuarios existentes que no tienen rol/tenant en el JWT.
 *
 * Ocurre cuando seed-test-users.mjs corrió ANTES de que las migraciones
 * aplicaran el trigger on_auth_user_created (que copia user_metadata → app_metadata).
 *
 * Uso:
 *   node --env-file=apps/web/.env.local scripts/fix-app-metadata.mjs
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

async function main() {
  // 1. Leer todos los usuarios de public.users (fuente de verdad de rol/tenant)
  const { data: pubUsers, error: pubErr } = await admin
    .from('users')
    .select('id, nombre, role, tenant_id')
    .eq('activo', true);

  if (pubErr) throw new Error(`Error leyendo public.users: ${pubErr.message}`);

  // 2. Leer todos los usuarios de auth para detectar los que no están en public.users
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const pubIds = new Set(pubUsers.map((u) => u.id));
  const orphans = (authList?.users ?? []).filter((u) => !pubIds.has(u.id));

  console.log(`\nUsuarios en public.users : ${pubUsers.length}`);
  console.log(`Usuarios en auth.users   : ${authList?.users?.length ?? 0}`);
  if (orphans.length > 0) {
    console.log(`\n⚠  Usuarios en auth sin fila en public.users (no se pueden reparar):`);
    orphans.forEach((u) => console.log(`   ${u.email}`));
    console.log(
      `   → Agrégalos en el panel de Supabase: Authentication → Users → Edit → App Metadata`,
    );
  }
  console.log('');

  let fixed = 0;
  let alreadyOk = 0;
  let errors = 0;

  for (const u of pubUsers) {
    // 3. Leer el usuario en auth.users
    const { data: authData, error: authErr } = await admin.auth.admin.getUserById(u.id);
    if (authErr || !authData?.user) {
      console.error(
        `✗ ${u.nombre} (${u.id.slice(0, 8)}) — no encontrado en auth: ${authErr?.message}`,
      );
      errors++;
      continue;
    }

    const appMeta = authData.user.app_metadata ?? {};
    const hasRole = !!appMeta.role;
    const hasTenant = !!appMeta.tenant_id;

    if (hasRole && hasTenant) {
      console.log(`✓ ${u.role.padEnd(22)} ${authData.user.email} — OK`);
      alreadyOk++;
      continue;
    }

    // 4. Actualizar app_metadata faltante
    const { error: updateErr } = await admin.auth.admin.updateUserById(u.id, {
      app_metadata: {
        ...appMeta,
        tenant_id: u.tenant_id,
        role: u.role,
      },
    });

    if (updateErr) {
      console.error(`✗ ${u.role.padEnd(22)} ${authData.user.email} — ${updateErr.message}`);
      errors++;
    } else {
      console.log(`✔ ${u.role.padEnd(22)} ${authData.user.email} — app_metadata reparado`);
      fixed++;
    }
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log(`Reparados: ${fixed}  ·  Ya OK: ${alreadyOk}  ·  Errores: ${errors}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nError fatal:', err.message);
  process.exit(1);
});
