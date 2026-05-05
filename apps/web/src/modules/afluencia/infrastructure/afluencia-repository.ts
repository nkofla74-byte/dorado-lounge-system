import { createAdminClient } from '@/lib/supabase/admin';
import type { AfluenciaRepository } from '../application/ports/afluencia-repository.port';
import type { AfluenciaIngreso, RegistrarIngresoInput } from '../domain/afluencia';

interface AfluenciaRow {
  id: string;
  tenant_id: string;
  turno_id: string;
  cantidad: number;
  zona: string | null;
  registrado_por: string | null;
  vuelo_numero: string | null;
  ingresado_at: string;
  created_at: string;
}

function toEntity(row: AfluenciaRow): AfluenciaIngreso {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    turnoId: row.turno_id,
    cantidad: row.cantidad,
    zona: (row.zona as AfluenciaIngreso['zona']) ?? null,
    registradoPor: row.registrado_por,
    vueloNumero: row.vuelo_numero,
    ingresadoAt: new Date(row.ingresado_at),
    createdAt: new Date(row.created_at),
  };
}

export function createAfluenciaRepository(): AfluenciaRepository {
  const supabase = createAdminClient();

  return {
    async findByTurno(tenantId, turnoId) {
      const { data, error } = await supabase
        .from('afluencia_ingresos')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .order('ingresado_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data as AfluenciaRow[]).map(toEntity);
    },

    async getTotalByTurno(tenantId, turnoId) {
      const { data, error } = await supabase
        .from('afluencia_ingresos')
        .select('cantidad')
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId);

      if (error) throw new Error(error.message);
      return (data as { cantidad: number }[]).reduce((sum, r) => sum + r.cantidad, 0);
    },

    async create(tenantId, registradoPor, input) {
      const { data, error } = await supabase
        .from('afluencia_ingresos')
        .insert({
          tenant_id: tenantId,
          turno_id: input.turnoId,
          cantidad: input.cantidad,
          zona: input.zona ?? null,
          registrado_por: registradoPor,
          vuelo_numero: input.vueloNumero ?? null,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return toEntity(data as AfluenciaRow);
    },
  };
}
