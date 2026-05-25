import { createAdminClient } from '@/lib/supabase/admin';
import type { AfluenciaRepository } from '../application/ports/afluencia-repository.port';
import type { AfluenciaIngreso, RegistrarIngresoInput } from '../domain/afluencia';
import type { TurnoBloque } from '@dorado/shared-types';

const BOGOTA_TZ = 'America/Bogota';

/** Devuelve [startUTC, endUTC) del día actual en Bogotá. */
function rangoDiaBogotaUTC(): { startUTC: string; endUTC: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const fecha = `${get('year')}-${get('month')}-${get('day')}`;
  // Bogotá es UTC-5 todo el año (no tiene DST).
  return {
    startUTC: `${fecha}T05:00:00.000Z`,
    endUTC: `${fecha}T29:00:00.000Z`.replace('T29:', 'T05:').replace(fecha, addDays(fecha, 1)),
  };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

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

    async findByBloqueHoy(tenantId, bloque) {
      const { startUTC, endUTC } = rangoDiaBogotaUTC();
      const { data, error } = await supabase
        .from('afluencia_ingresos')
        .select('*, turnos!inner(bloque)')
        .eq('tenant_id', tenantId)
        .eq('turnos.bloque', bloque)
        .gte('ingresado_at', startUTC)
        .lt('ingresado_at', endUTC)
        .order('ingresado_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data as AfluenciaRow[]).map(toEntity);
    },

    async getTotalByBloqueHoy(tenantId, bloque) {
      const { startUTC, endUTC } = rangoDiaBogotaUTC();
      const { data, error } = await supabase
        .from('afluencia_ingresos')
        .select('cantidad, turnos!inner(bloque)')
        .eq('tenant_id', tenantId)
        .eq('turnos.bloque', bloque)
        .gte('ingresado_at', startUTC)
        .lt('ingresado_at', endUTC);

      if (error) throw new Error(error.message);
      return (data as { cantidad: number }[]).reduce((sum, r) => sum + r.cantidad, 0);
    },
  };
}
