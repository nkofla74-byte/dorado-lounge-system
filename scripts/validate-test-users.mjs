/**
 * READ-ONLY: valida el set canónico de 11 test users contra Supabase.
 * No muta nada (lista auth/public.users + prueba sign-in con anon key).
 *
 *   node --env-file=apps/web/.env.local scripts/validate-test-users.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromWeb = createRequire(path.resolve(here, '..', 'apps', 'web', 'package.json'));
const { createClient } = requireFromWeb('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error(
    '✗ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY',
  );
  process.exit(1);
}

const PASSWORD = 'Admin123';
const TENANT_SLUG = 'dorado-lounge';
const EXPECTED = [
  ['superuser@gisat.com', 'superuser'],
  ['admin@gisat.com', 'admin'],
  ['cocina.fria@dorado.test', 'chef_cocina_fria'],
  ['cocina.caliente@dorado.test', 'chef_cocina_caliente'],
  ['cocina.amex@dorado.test', 'sous_chef'],
  ['mesero.amex@dorado.test', 'mesero_amex'],
  ['almacen@dorado.test', 'personal_almacen'],
  ['pasteleria@dorado.test', 'personal_pasteleria'],
  ['zona.snack@dorado.test', 'personal_snack'],
  ['zona.buffet@dorado.test', 'personal_buffet'],
  ['steward@dorado.test', 'steward'],
];

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: tenants, error: tErr } = await admin.from('tenants').select('id, slug, activo');
  if (tErr) throw new Error(`tenants: ${tErr.message}`);
  const tenantOp = tenants.find((t) => t.slug === TENANT_SLUG);
  if (!tenantOp) throw new Error(`tenant ${TENANT_SLUG} no encontrado`);
  console.log(`Tenant operativo: ${TENANT_SLUG} (${tenantOp.id}) activo=${tenantOp.activo}\n`);

  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authByEmail = new Map((authList?.users ?? []).map((u) => [u.email, u]));

  const { data: pubUsers, error: pErr } = await admin
    .from('users')
    .select('id, nombre, role, tenant_id, activo');
  if (pErr) throw new Error(`public.users: ${pErr.message}`);
  const pubById = new Map(pubUsers.map((u) => [u.id, u]));

  console.log(
    'estado  email                          rol esperado            auth  meta  public  login',
  );
  console.log('─'.repeat(96));

  let allOk = true;
  for (const [email, role] of EXPECTED) {
    const a = authByEmail.get(email);
    const authOk = !!a;
    const confirmed = !!a?.email_confirmed_at;
    const metaRole = a?.app_metadata?.role;
    const metaTenant = a?.app_metadata?.tenant_id;
    const metaOk = metaRole === role && metaTenant === tenantOp.id;
    const pub = a ? pubById.get(a.id) : null;
    const pubOk =
      !!pub && pub.role === role && pub.tenant_id === tenantOp.id && pub.activo === true;

    // login (read-only): intenta sign-in con anon key
    let loginOk = false;
    let loginErr = '';
    if (authOk) {
      const anon = createClient(URL, ANON, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: s, error: e } = await anon.auth.signInWithPassword({
        email,
        password: PASSWORD,
      });
      loginOk = !!s?.session && !e;
      if (e) loginErr = e.message;
      if (s?.session) await anon.auth.signOut();
    }

    const ok = authOk && confirmed && metaOk && pubOk && loginOk;
    if (!ok) allOk = false;
    const mark = ok ? '✅' : '❌';
    console.log(
      `${mark}      ${email.padEnd(30)} ${role.padEnd(22)} ${authOk ? (confirmed ? 'ok ' : 'unc') : '✗  '}   ${metaOk ? 'ok  ' : '✗   '}  ${pubOk ? 'ok    ' : '✗     '}  ${loginOk ? 'ok' : '✗ ' + loginErr}`,
    );
  }

  // extras: auth users del tenant no esperados
  const expectedEmails = new Set(EXPECTED.map(([e]) => e));
  const extrasAuth = [...authByEmail.keys()].filter((e) => !expectedEmails.has(e));
  console.log(
    '\n── Auth users fuera del set canónico:',
    extrasAuth.length ? extrasAuth.join(', ') : '(ninguno)',
  );
  console.log('── public.users total:', pubUsers.length, '| auth users total:', authByEmail.size);
  console.log(
    '\n' +
      (allOk
        ? `✅ TODOS los ${EXPECTED.length} canónicos OK (auth+meta+public+login)`
        : '❌ Hay discrepancias — revisar arriba'),
  );
  process.exit(allOk ? 0 : 2);
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
