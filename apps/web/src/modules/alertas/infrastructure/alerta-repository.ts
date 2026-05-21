import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/result';
import type { AlertaRepository } from '../application/ports/alerta-repository.port';
import type { Alerta, CreateAlertaInput } from '../domain/alerta';

type AlertaRow = {
  id: string;
  tenant_id: string;
  tipo: string;
  severidad: string;
  titulo: string;
  mensaje: string;
  resource_id: string | null;
  resource_tipo: string | null;
  leida: boolean;
  leida_at: string | null;
  created_at: string;
};

const SELECT =
  'id, tenant_id, tipo, severidad, titulo, mensaje, resource_id, resource_tipo, leida, leida_at, created_at';

async function resolveTenantInfo(
  admin: ReturnType<typeof createAdminClient>,
  rows: AlertaRow[],
): Promise<Record<string, { nombre: string; slug: string }>> {
  const ids = Array.from(new Set(rows.map((r) => r.tenant_id)));
  if (ids.length === 0) return {};
  const { data } = await admin.from('tenants').select('id, nombre, slug').in('id', ids);
  return Object.fromEntries(
    (data ?? []).map((t) => [t.id, { nombre: t.nombre as string, slug: t.slug as string }]),
  );
}

function toAlerta(
  row: AlertaRow,
  tenantMap: Record<string, { nombre: string; slug: string }>,
): Alerta {
  const tenant = tenantMap[row.tenant_id];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantNombre: tenant?.nombre ?? null,
    tenantSlug: tenant?.slug ?? null,
    tipo: row.tipo as Alerta['tipo'],
    severidad: row.severidad as Alerta['severidad'],
    titulo: row.titulo,
    mensaje: row.mensaje,
    resourceId: row.resource_id,
    resourceTipo: row.resource_tipo as Alerta['resourceTipo'],
    leida: row.leida,
    leidaAt: row.leida_at ? new Date(row.leida_at) : null,
    createdAt: new Date(row.created_at),
  };
}

// Cuando tenantId=null usamos admin (bypassea RLS) — el rol superuser ya fue
// validado en la action vía assertCan.
export function createAlertaRepository(): AlertaRepository {
  return {
    async findRecent(tenantId, limit = 30): Promise<Alerta[]> {
      const admin = createAdminClient();
      let q: any =
        tenantId === null
          ? admin.from('alertas').select(SELECT)
          : (await createClient()).from('alertas').select(SELECT).eq('tenant_id', tenantId);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as AlertaRow[];
      const tenantMap = await resolveTenantInfo(admin, rows);
      return rows.map((r) => toAlerta(r, tenantMap));
    },

    async findAll(tenantId, limit = 500): Promise<Alerta[]> {
      const admin = createAdminClient();
      let q: any =
        tenantId === null
          ? admin.from('alertas').select(SELECT)
          : (await createClient()).from('alertas').select(SELECT).eq('tenant_id', tenantId);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as AlertaRow[];
      const tenantMap = await resolveTenantInfo(admin, rows);
      return rows.map((r) => toAlerta(r, tenantMap));
    },

    async countUnread(tenantId): Promise<number> {
      if (tenantId === null) {
        const admin = createAdminClient();
        const { count, error } = await admin
          .from('alertas')
          .select('id', { count: 'exact', head: true })
          .eq('leida', false);
        if (error) throw new AppError('DB_ERROR', 500, error.message);
        return count ?? 0;
      }
      const supabase = await createClient();
      const { count, error } = await supabase
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('leida', false);
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return count ?? 0;
    },

    async create(tenantId: string, input: CreateAlertaInput): Promise<Alerta> {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('alertas')
        .insert({
          tenant_id: tenantId,
          tipo: input.tipo,
          severidad: input.severidad,
          titulo: input.titulo,
          mensaje: input.mensaje,
          resource_id: input.resourceId ?? null,
          resource_tipo: input.resourceTipo ?? null,
        })
        .select(SELECT)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const row = data as AlertaRow;
      const tenantMap = await resolveTenantInfo(admin, [row]);
      return toAlerta(row, tenantMap);
    },

    async marcarLeida(id, tenantId, userId): Promise<void> {
      // tenantId=null (superuser): admin client + solo filtra por id.
      if (tenantId === null) {
        const admin = createAdminClient();
        const { error } = await admin
          .from('alertas')
          .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
          .eq('id', id);
        if (error) throw new AppError('DB_ERROR', 500, error.message);
        return;
      }
      const supabase = await createClient();
      const { error } = await supabase
        .from('alertas')
        .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },

    async marcarTodasLeidas(tenantId, userId): Promise<void> {
      // tenantId=null (superuser): marca todas no-leídas de TODOS los tenants.
      if (tenantId === null) {
        const admin = createAdminClient();
        const { error } = await admin
          .from('alertas')
          .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
          .eq('leida', false);
        if (error) throw new AppError('DB_ERROR', 500, error.message);
        return;
      }
      const supabase = await createClient();
      const { error } = await supabase
        .from('alertas')
        .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
        .eq('tenant_id', tenantId)
        .eq('leida', false);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },
  };
}
