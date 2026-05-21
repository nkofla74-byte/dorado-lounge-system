import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/result';
import type { AnalyticsRepository } from '../application/ports/analytics-repository.port';
import type { CogsPerPassenger, ConsumoInsumo, AnalyticsFilters } from '../domain/kpi';

type CogsRow = {
  tenant_id: string;
  turno_id: string;
  turno_nombre: string;
  iniciado_at: string;
  cerrado_at: string | null;
  total_pasajeros: number;
  cogs_total_cop: number;
  cogs_per_passenger: number | null;
};

type ConsumoRow = {
  tenant_id: string;
  turno_id: string;
  turno_nombre: string;
  insumo_id: string;
  insumo_nombre: string;
  capa: string;
  unidad_medida: string;
  total_entradas: number;
  total_consumo: number;
  total_merma: number;
  total_ajustes: number;
};

async function resolveTenantInfo(
  admin: ReturnType<typeof createAdminClient>,
  tenantIds: string[],
): Promise<Record<string, { nombre: string; slug: string }>> {
  const ids = Array.from(new Set(tenantIds));
  if (ids.length === 0) return {};
  const { data } = await admin.from('tenants').select('id, nombre, slug').in('id', ids);
  return Object.fromEntries(
    (data ?? []).map((t) => [t.id, { nombre: t.nombre as string, slug: t.slug as string }]),
  );
}

function toCogs(
  row: CogsRow,
  tenantMap: Record<string, { nombre: string; slug: string }>,
): CogsPerPassenger {
  const tenant = tenantMap[row.tenant_id];
  return {
    tenantId: row.tenant_id,
    tenantNombre: tenant?.nombre ?? null,
    tenantSlug: tenant?.slug ?? null,
    turnoId: row.turno_id,
    turnoNombre: row.turno_nombre,
    iniciadoAt: new Date(row.iniciado_at),
    cerradoAt: row.cerrado_at ? new Date(row.cerrado_at) : null,
    totalPasajeros: Number(row.total_pasajeros),
    cogsTotalCop: Number(row.cogs_total_cop),
    cogsPerPassenger: row.cogs_per_passenger !== null ? Number(row.cogs_per_passenger) : null,
  };
}

function toConsumo(
  row: ConsumoRow,
  tenantMap: Record<string, { nombre: string; slug: string }>,
): ConsumoInsumo {
  const tenant = tenantMap[row.tenant_id];
  return {
    tenantId: row.tenant_id,
    tenantNombre: tenant?.nombre ?? null,
    tenantSlug: tenant?.slug ?? null,
    turnoId: row.turno_id,
    turnoNombre: row.turno_nombre,
    insumoId: row.insumo_id,
    insumoNombre: row.insumo_nombre,
    capa: row.capa,
    unidadMedida: row.unidad_medida,
    totalEntradas: Number(row.total_entradas),
    totalConsumo: Number(row.total_consumo),
    totalMerma: Number(row.total_merma),
    totalAjustes: Number(row.total_ajustes),
  };
}

const COGS_SELECT =
  'tenant_id, turno_id, turno_nombre, iniciado_at, cerrado_at, total_pasajeros, cogs_total_cop, cogs_per_passenger';
const CONSUMO_SELECT =
  'tenant_id, turno_id, turno_nombre, insumo_id, insumo_nombre, capa, unidad_medida, total_entradas, total_consumo, total_merma, total_ajustes';

export function createAnalyticsRepository(): AnalyticsRepository {
  return {
    async getCogsPerPassenger(tenantId, filters): Promise<CogsPerPassenger[]> {
      const admin = createAdminClient();
      let query: any;
      if (tenantId === null) {
        query = admin
          .from('mv_cogs_per_passenger')
          .select(COGS_SELECT)
          .order('iniciado_at', { ascending: false })
          .limit(200);
      } else {
        const supabase = await createClient();
        query = supabase
          .from('mv_cogs_per_passenger')
          .select(COGS_SELECT)
          .eq('tenant_id', tenantId)
          .order('iniciado_at', { ascending: false })
          .limit(100);
      }

      if (filters.turnoId) query = query.eq('turno_id', filters.turnoId);
      if (filters.desde) query = query.gte('iniciado_at', filters.desde);
      if (filters.hasta) query = query.lte('iniciado_at', `${filters.hasta}T23:59:59`);

      const { data, error } = await query;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as CogsRow[];
      const tenantMap = await resolveTenantInfo(
        admin,
        rows.map((r) => r.tenant_id),
      );
      return rows.map((r) => toCogs(r, tenantMap));
    },

    async getConsumoVsProduccion(tenantId, filters): Promise<ConsumoInsumo[]> {
      const admin = createAdminClient();
      let query: any;
      if (tenantId === null) {
        query = admin
          .from('mv_consumo_vs_produccion_turno')
          .select(CONSUMO_SELECT)
          .order('turno_id', { ascending: false })
          .order('insumo_nombre', { ascending: true })
          .limit(1000);
      } else {
        const supabase = await createClient();
        query = supabase
          .from('mv_consumo_vs_produccion_turno')
          .select(CONSUMO_SELECT)
          .eq('tenant_id', tenantId)
          .order('turno_id', { ascending: false })
          .order('insumo_nombre', { ascending: true })
          .limit(500);
      }

      if (filters.turnoId) query = query.eq('turno_id', filters.turnoId);
      if (filters.desde) query = query.gte('iniciado_at', filters.desde);
      if (filters.hasta) query = query.lte('iniciado_at', `${filters.hasta}T23:59:59`);

      const { data, error } = await query;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as ConsumoRow[];
      const tenantMap = await resolveTenantInfo(
        admin,
        rows.map((r) => r.tenant_id),
      );
      return rows.map((r) => toConsumo(r, tenantMap));
    },
  };
}
