import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { FlightsRepository } from '../application/ports/flights-repository.port';
import type { Flight, FlightStats, OcupacionDiaria } from '../domain/flight';
import type { FlightForecastInput } from '../domain/forecast';

const BOGOTA_TZ = 'America/Bogota';

function fechaBogota(date: Date): string {
  // YYYY-MM-DD del día en Bogotá para una fecha UTC.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

type OcupacionRow = {
  fecha: string;
  departures_vuelos: number;
  arrivals_vuelos: number;
  vuelos_cancelados: number;
  vuelos_sin_capacidad: number;
  departures_capacidad: number;
  arrivals_capacidad: number;
  capacidad_estimada: number;
  pasajeros_reales: number;
  ocupacion_pct: number | null;
};

export function createFlightRepository(): FlightsRepository {
  return {
    async upsertSnapshots(tenantId: string, flights: Flight[]): Promise<number> {
      if (flights.length === 0) return 0;
      const admin = createAdminClient();

      // Lookup de capacidad por IATA. Una sola query para todos los códigos únicos.
      const codes = Array.from(
        new Set(flights.map((f) => f.aircraftIata).filter((c): c is string => Boolean(c))),
      );
      const capacityMap = new Map<string, number>();
      if (codes.length > 0) {
        const { data, error } = await admin
          .from('aircraft_capacity')
          .select('iata_code, asientos')
          .in('iata_code', codes);
        if (error) throw new AppError('DB_ERROR', 500, error.message);
        for (const row of data ?? []) {
          capacityMap.set(row.iata_code, row.asientos);
        }
      }

      const allRows = flights.map((f) => ({
        tenant_id: tenantId,
        fecha: fechaBogota(f.scheduledTime),
        numero: f.flightNumber,
        direccion: f.direction,
        aerolinea: f.airline,
        aircraft_iata: f.aircraftIata,
        origen: f.origin,
        destino: f.destination,
        scheduled_at: f.scheduledTime.toISOString(),
        estimated_at: f.estimatedTime?.toISOString() ?? null,
        actual_at: f.actualTime?.toISOString() ?? null,
        status: f.status,
        gate: f.gate,
        terminal: f.terminal,
        capacidad_estimada: f.aircraftIata ? (capacityMap.get(f.aircraftIata) ?? null) : null,
        updated_at: new Date().toISOString(),
      }));

      const seen = new Set<string>();
      const rows = allRows.filter((r) => {
        const key = `${r.tenant_id}:${r.fecha}:${r.numero}:${r.direccion}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await admin
          .from('vuelos_snapshots')
          .upsert(batch, { onConflict: 'tenant_id,fecha,numero,direccion' });
        if (error) throw new AppError('DB_ERROR', 500, error.message);
      }

      return rows.length;
    },

    async refreshOcupacionDiaria(): Promise<void> {
      const admin = createAdminClient();
      const { error } = await admin.rpc('refresh_ocupacion_diaria');
      if (error?.message?.includes('not populated')) {
        // First refresh ever — CONCURRENTLY needs existing data. Silently skip;
        // the data is already in vuelos_snapshots and the forecast reads from there directly.
        return;
      }
      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },

    async getOcupacionUltimos7d(tenantId: string): Promise<OcupacionDiaria[]> {
      const supabase = await createClient();
      const desde = new Date();
      desde.setDate(desde.getDate() - 7);

      const { data, error } = await supabase
        .from('v_ocupacion_diaria_tenant')
        .select(
          'fecha, departures_vuelos, arrivals_vuelos, vuelos_cancelados, vuelos_sin_capacidad, departures_capacidad, arrivals_capacidad, capacidad_estimada, pasajeros_reales, ocupacion_pct',
        )
        .eq('tenant_id', tenantId)
        .gte('fecha', fechaBogota(desde))
        .order('fecha', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      return ((data ?? []) as OcupacionRow[]).map((r) => ({
        fecha: r.fecha,
        departuresVuelos: r.departures_vuelos,
        arrivalsVuelos: r.arrivals_vuelos,
        vuelosCancelados: r.vuelos_cancelados,
        vuelosSinCapacidad: r.vuelos_sin_capacidad,
        departuresCapacidad: r.departures_capacidad,
        arrivalsCapacidad: r.arrivals_capacidad,
        capacidadEstimada: r.capacidad_estimada,
        pasajerosReales: r.pasajeros_reales,
        ocupacionPct: r.ocupacion_pct,
      }));
    },

    async getTopAerolineas(tenantId: string, dias: number): Promise<FlightStats['topAerolineas']> {
      const supabase = await createClient();
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);

      const { data, error } = await supabase
        .from('vuelos_snapshots')
        .select('aerolinea, capacidad_estimada')
        .eq('tenant_id', tenantId)
        .gte('fecha', fechaBogota(desde))
        .neq('status', 'cancelled');

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      const agg = new Map<string, { vuelos: number; capacidad: number }>();
      for (const row of data ?? []) {
        const key = row.aerolinea ?? '—';
        const prev = agg.get(key) ?? { vuelos: 0, capacidad: 0 };
        prev.vuelos += 1;
        prev.capacidad += row.capacidad_estimada ?? 0;
        agg.set(key, prev);
      }

      return Array.from(agg.entries())
        .map(([aerolinea, v]) => ({ aerolinea, ...v }))
        .sort((a, b) => b.vuelos - a.vuelos)
        .slice(0, 5);
    },

    async getDeparturesForDate(tenantId: string, fecha: string): Promise<FlightForecastInput[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('vuelos_snapshots')
        .select('destino, aerolinea, capacidad_estimada, status')
        .eq('tenant_id', tenantId)
        .eq('fecha', fecha)
        .eq('direccion', 'departure');

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      return (data ?? []).map((r) => ({
        destination: (r.destino as string) ?? '—',
        airline: (r.aerolinea as string) ?? '—',
        capacity: (r.capacidad_estimada as number | null) ?? null,
        status: (r.status as string) ?? 'scheduled',
      }));
    },
  };
}
