import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { TurnoRepository } from '../application/ports/turno-repository.port';
import type { Turno } from '../domain/turno';

type TurnoRow = {
  id: string;
  tenant_id: string;
  nombre: string;
  responsable_id: string | null;
  iniciado_at: string;
  cerrado_at: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

function toTurno(row: TurnoRow): Turno {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    responsableId: row.responsable_id,
    iniciadoAt: new Date(row.iniciado_at),
    cerradoAt: row.cerrado_at ? new Date(row.cerrado_at) : null,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const SELECT_FIELDS =
  'id, tenant_id, nombre, responsable_id, iniciado_at, cerrado_at, activo, created_at, updated_at';

export function createTurnoRepository(): TurnoRepository {
  return {
    async findAll(tenantId: string): Promise<Turno[]> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('turnos')
        .select(SELECT_FIELDS)
        .eq('tenant_id', tenantId)
        .order('iniciado_at', { ascending: false })
        .limit(50);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as TurnoRow[]).map(toTurno);
    },

    async findActivo(tenantId: string): Promise<Turno | null> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('turnos')
        .select(SELECT_FIELDS)
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('iniciado_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return data ? toTurno(data as TurnoRow) : null;
    },

    async create(tenantId: string, nombre: string, responsableId: string): Promise<Turno> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('turnos')
        .insert({ tenant_id: tenantId, nombre, responsable_id: responsableId })
        .select(SELECT_FIELDS)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toTurno(data as TurnoRow);
    },

    async cerrar(turnoId: string, tenantId: string): Promise<Turno> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('turnos')
        .update({ activo: false, cerrado_at: new Date().toISOString() })
        .eq('id', turnoId)
        .eq('tenant_id', tenantId)
        .select(SELECT_FIELDS)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toTurno(data as TurnoRow);
    },
  };
}
