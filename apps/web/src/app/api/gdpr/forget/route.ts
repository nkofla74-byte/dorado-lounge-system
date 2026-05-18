import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const rl = await rateLimit('gdpr', user.id);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes — vuelve en 24 h' }, { status: 429 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 });
  }

  await auditLog({
    tenantId,
    userId: user.id,
    action: 'gdpr.forget_requested',
    resourceType: 'users',
    resourceId: user.id,
    payload: { email: user.email },
  });

  // Anonymize via Supabase Admin SDK
  const admin = createAdminClient();
  const anonymizedEmail = `deleted-${user.id}@anon.doradolounge.invalid`;

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email: anonymizedEmail,
    user_metadata: { full_name: 'Usuario eliminado', name: 'Usuario eliminado' },
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo anonimizar la cuenta' }, { status: 500 });
  }

  // Sign out after anonymization
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
