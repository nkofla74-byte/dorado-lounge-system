import { createAdminClient } from '@/lib/supabase/admin';
import type { AfluenciaRepository } from '../application/ports/afluencia-repository.port';
import type { AfluenciaIngreso, RegistrarIngresoInput } from '../domain/afluencia';
import type { PasajeroIngreso, RegistrarPasajeroInput } from '../domain/pasajero-ingreso';
import type { TurnoBloque, ZonaServicio } from '@dorado/shared-types';

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

    async findPasajerosByTurno(tenantId, turnoId) {
      const { data, error } = await supabase
        .from('pasajeros_ingreso')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .is('deleted_at', null)
        .order('ingresado_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []).map(toPasajeroEntity);
    },

    async getTotalPasajerosByTurno(tenantId, turnoId) {
      const { data, error } = await supabase
        .from('pasajeros_ingreso')
        .select('acompanantes')
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .is('deleted_at', null);

      if (error) throw new Error(error.message);
      return (data ?? []).reduce((sum, r) => sum + 1 + (r.acompanantes as number), 0);
    },

    async createPasajero(tenantId, registradoPor, input) {
      const { data, error } = await supabase
        .from('pasajeros_ingreso')
        .insert({
          tenant_id: tenantId,
          turno_id: input.turnoId,
          nombre_pasajero: input.nombrePasajero.trim(),
          documento_tipo: input.documentoTipo ?? null,
          documento_numero: input.documentoNumero ?? null,
          vuelo_numero: input.vueloNumero ?? null,
          aerolinea: input.aerolinea ?? null,
          destino: input.destino ?? null,
          hora_vuelo: input.horaVuelo ?? null,
          asiento: input.asiento ?? null,
          gate: input.gate ?? null,
          tipo_acceso: input.tipoAcceso,
          tarjeta_ultimos4: input.tarjetaUltimos4 ?? null,
          acompanantes: input.acompanantes ?? 0,
          zona: input.zona ?? null,
          registrado_por: registradoPor,
          notas: input.notas ?? null,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return toPasajeroEntity(data as PasajeroRow);
    },
  };
}

interface PasajeroRow {
  id: string;
  tenant_id: string;
  turno_id: string;
  nombre_pasajero: string;
  documento_tipo: string | null;
  documento_numero: string | null;
  vuelo_numero: string | null;
  aerolinea: string | null;
  destino: string | null;
  hora_vuelo: string | null;
  asiento: string | null;
  gate: string | null;
  tipo_acceso: string;
  tarjeta_ultimos4: string | null;
  acompanantes: number;
  zona: string | null;
  registrado_por: string;
  ingresado_at: string;
  notas: string | null;
  created_at: string;
}

function toPasajeroEntity(row: PasajeroRow): PasajeroIngreso {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    turnoId: row.turno_id,
    nombrePasajero: row.nombre_pasajero,
    documentoTipo: row.documento_tipo,
    documentoNumero: row.documento_numero,
    vueloNumero: row.vuelo_numero,
    aerolinea: row.aerolinea,
    destino: row.destino,
    horaVuelo: row.hora_vuelo ? new Date(row.hora_vuelo) : null,
    asiento: row.asiento,
    gate: row.gate,
    tipoAcceso: row.tipo_acceso as PasajeroIngreso['tipoAcceso'],
    tarjetaUltimos4: row.tarjeta_ultimos4,
    acompanantes: row.acompanantes,
    zona: (row.zona as ZonaServicio) ?? null,
    registradoPor: row.registrado_por,
    ingresadoAt: new Date(row.ingresado_at),
    notas: row.notas,
    createdAt: new Date(row.created_at),
  };
}
