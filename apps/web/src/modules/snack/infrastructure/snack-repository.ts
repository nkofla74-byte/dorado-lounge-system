import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { SnackRepository } from '../application/ports/snack-repository.port';
import type { DespachoSnack, TurnoActivo } from '../domain/despacho-snack';
import type { StuartRequest } from '../domain/stuart-request';
import type { SolicitudPreparacion } from '../domain/solicitud-preparacion';

const STUART_SNACK_CHANNEL = 'sala:stuart:snack';
const COCINA_CHANNEL = 'sala:cocina';

type DespachoRow = {
  id: string;
  tenant_id: string;
  receta_id: string;
  turno_id: string | null;
  cantidad: number;
  responsable_id: string | null;
  despachado_at: string;
  created_at: string;
  receta: { nombre: string } | null;
};

type TurnoRow = {
  id: string;
  nombre: string;
  activo: boolean;
  iniciado_at: string;
};

type MensajeRow = {
  id: string;
  tenant_id: string;
  canal: string;
  remitente_id: string;
  contenido: string;
  created_at: string;
};

const DESPACHO_SELECT = `
  id, tenant_id, receta_id, turno_id, cantidad, responsable_id,
  despachado_at, created_at,
  receta:recetas(nombre)
`;

function toDespacho(row: DespachoRow): DespachoSnack {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    recetaId: row.receta_id,
    recetaNombre: row.receta?.nombre ?? '',
    turnoId: row.turno_id,
    cantidad: row.cantidad,
    responsableId: row.responsable_id,
    despachadoAt: new Date(row.despachado_at),
    createdAt: new Date(row.created_at),
  };
}

function toStuart(row: MensajeRow): StuartRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    canal: row.canal,
    remitenteId: row.remitente_id,
    descripcion: row.contenido,
    createdAt: new Date(row.created_at),
  };
}

function toSolicitud(row: MensajeRow): SolicitudPreparacion {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    canal: row.canal,
    remitenteId: row.remitente_id,
    descripcion: row.contenido,
    createdAt: new Date(row.created_at),
  };
}

export function createSnackRepository(): SnackRepository {
  return {
    async findDespachos(tenantId: string, turnoId?: string): Promise<DespachoSnack[]> {
      const supabase = await createClient();

      let query = supabase
        .from('despachos')
        .select(DESPACHO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('zona', 'snack')
        .order('despachado_at', { ascending: false })
        .limit(100);

      if (turnoId) query = query.eq('turno_id', turnoId);

      const { data, error } = await query;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as DespachoRow[]).map(toDespacho);
    },

    async findTurnosActivos(tenantId: string): Promise<TurnoActivo[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('turnos')
        .select('id, nombre, activo, iniciado_at')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .order('iniciado_at', { ascending: false })
        .limit(10);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as TurnoRow[]).map((r) => ({
        id: r.id,
        nombre: r.nombre,
        activo: r.activo,
        iniciadoAt: new Date(r.iniciado_at),
      }));
    },

    async findStuartRequests(tenantId: string, limit = 20): Promise<StuartRequest[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('mensajes_chat')
        .select('id, tenant_id, canal, remitente_id, contenido, created_at')
        .eq('tenant_id', tenantId)
        .eq('canal', STUART_SNACK_CHANNEL)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as MensajeRow[]).map(toStuart);
    },

    async createStuartRequest(
      tenantId: string,
      input: { remitenteId: string; descripcion: string },
    ): Promise<StuartRequest> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('mensajes_chat')
        .insert({
          tenant_id: tenantId,
          canal: STUART_SNACK_CHANNEL,
          remitente_id: input.remitenteId,
          contenido: input.descripcion,
          tipo: 'alert',
        })
        .select('id, tenant_id, canal, remitente_id, contenido, created_at')
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toStuart(data as MensajeRow);
    },

    async findSolicitudesPreparacion(
      tenantId: string,
      limit = 20,
    ): Promise<SolicitudPreparacion[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('mensajes_chat')
        .select('id, tenant_id, canal, remitente_id, contenido, created_at')
        .eq('tenant_id', tenantId)
        .eq('canal', COCINA_CHANNEL)
        .eq('tipo', 'alert')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as MensajeRow[]).map(toSolicitud);
    },

    async createSolicitudPreparacion(
      tenantId: string,
      input: { remitenteId: string; descripcion: string; canal?: string },
    ): Promise<SolicitudPreparacion> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('mensajes_chat')
        .insert({
          tenant_id: tenantId,
          canal: input.canal ?? COCINA_CHANNEL,
          remitente_id: input.remitenteId,
          contenido: input.descripcion,
          tipo: 'alert',
        })
        .select('id, tenant_id, canal, remitente_id, contenido, created_at')
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toSolicitud(data as MensajeRow);
    },
  };
}
