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

function toAlerta(row: AlertaRow): Alerta {
  return {
    id: row.id,
    tenantId: row.tenant_id,
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

export function createAlertaRepository(): AlertaRepository {
  return {
    async findRecent(tenantId: string, limit = 30): Promise<Alerta[]> {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('alertas')
        .select(SELECT)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as AlertaRow[]).map(toAlerta);
    },

    async countUnread(tenantId: string): Promise<number> {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('leida', false);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return count ?? 0;
    },

    // Usa admin client para poder insertar desde Server Actions sin restricción de RLS de rol
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
      return toAlerta(data as AlertaRow);
    },

    async marcarLeida(id: string, tenantId: string, userId: string): Promise<void> {
      const supabase = createClient();
      const { error } = await supabase
        .from('alertas')
        .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },

    async marcarTodasLeidas(tenantId: string, userId: string): Promise<void> {
      const supabase = createClient();
      const { error } = await supabase
        .from('alertas')
        .update({ leida: true, leida_at: new Date().toISOString(), leida_por: userId })
        .eq('tenant_id', tenantId)
        .eq('leida', false);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },
  };
}
