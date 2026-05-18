import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FeatureFlagRepository } from '../application/ports/feature-flag-repository.port';
import type { FeatureFlag, CreateFeatureFlagInput } from '../domain/feature-flag';
import { AppError } from '@/lib/result';

interface FeatureFlagRow {
  id: string;
  tenant_id: string | null;
  clave: string;
  valor: boolean;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
}

function toFeatureFlag(row: FeatureFlagRow): FeatureFlag {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clave: row.clave,
    valor: row.valor,
    descripcion: row.descripcion,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createFeatureFlagRepository(): FeatureFlagRepository {
  return {
    async getAll(tenantId: string): Promise<FeatureFlag[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('feature_flags')
        .select('*')
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .order('clave');
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as FeatureFlagRow[]).map(toFeatureFlag);
    },

    async set(clave: string, valor: boolean, tenantId: string): Promise<FeatureFlag> {
      // Escritura requiere service_role (solo superuser llega aquí)
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('feature_flags')
        .update({ valor, updated_at: new Date().toISOString() })
        .eq('clave', clave)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toFeatureFlag(data as FeatureFlagRow);
    },

    async create(input: CreateFeatureFlagInput, tenantId: string): Promise<FeatureFlag> {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('feature_flags')
        .insert({
          clave: input.clave,
          valor: input.valor ?? false,
          descripcion: input.descripcion ?? null,
          tenant_id: input.tenantId !== undefined ? input.tenantId : tenantId,
        })
        .select('*')
        .single();
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toFeatureFlag(data as FeatureFlagRow);
    },
  };
}
