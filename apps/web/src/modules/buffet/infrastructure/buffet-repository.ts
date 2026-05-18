import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { BuffetRepository } from '../application/ports/buffet-repository.port';
import type {
  DespachoBuffet,
  RecetaServicioBuffet,
  DespachoIngrediente,
  CreateDespachoBuffetInput,
} from '../domain/despacho-buffet';
import type { TicketTurno, TurnoActivo, CreateTicketsTurnoInput } from '../domain/ticket-turno';

type DespachoRow = {
  id: string;
  tenant_id: string;
  receta_id: string;
  turno_id: string | null;
  cantidad: number;
  responsable_id: string | null;
  idempotency_key: string | null;
  despachado_at: string;
  created_at: string;
  receta: { nombre: string } | null;
};

type IngredienteRow = {
  insumo_id: string;
  cantidad: number;
  merma_coeficiente: number;
  insumo: { nombre: string } | null;
};

type RecetaWithIngsRow = {
  id: string;
  nombre: string;
  porciones: number;
  receta_ingredientes: IngredienteRow[];
};

type TicketRow = {
  id: string;
  tenant_id: string;
  turno_id: string;
  cantidad_tickets: number;
  registrado_por: string | null;
  idempotency_key: string | null;
  created_at: string;
  turno: { nombre: string } | null;
};

type TurnoRow = {
  id: string;
  nombre: string;
  activo: boolean;
  iniciado_at: string;
};

function toDespacho(row: DespachoRow): DespachoBuffet {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    recetaId: row.receta_id,
    recetaNombre: row.receta?.nombre ?? '',
    turnoId: row.turno_id,
    cantidad: row.cantidad,
    responsableId: row.responsable_id,
    idempotencyKey: row.idempotency_key,
    despachadoAt: new Date(row.despachado_at),
    createdAt: new Date(row.created_at),
  };
}

function toTicket(row: TicketRow): TicketTurno {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    turnoId: row.turno_id,
    turnoNombre: row.turno?.nombre ?? '',
    cantidadTickets: row.cantidad_tickets,
    registradoPor: row.registrado_por,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at),
  };
}

const DESPACHO_SELECT = `
  id, tenant_id, receta_id, turno_id, cantidad, responsable_id,
  idempotency_key, despachado_at, created_at,
  receta:recetas(nombre)
`;

export function createBuffetRepository(): BuffetRepository {
  return {
    async findDespachos(tenantId: string, turnoId?: string): Promise<DespachoBuffet[]> {
      const supabase = await createClient();

      let query = supabase
        .from('despachos')
        .select(DESPACHO_SELECT)
        .eq('tenant_id', tenantId)
        .eq('zona', 'buffet')
        .order('despachado_at', { ascending: false })
        .limit(100);

      if (turnoId) query = query.eq('turno_id', turnoId);

      const { data, error } = await query;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as DespachoRow[]).map(toDespacho);
    },

    async findRecetaServicioBuffet(
      recetaId: string,
      tenantId: string,
    ): Promise<RecetaServicioBuffet | null> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('recetas')
        .select(
          `id, nombre, porciones,
           receta_ingredientes(insumo_id, cantidad, merma_coeficiente, insumo:insumos(nombre))`,
        )
        .eq('id', recetaId)
        .eq('tenant_id', tenantId)
        .eq('tipo_receta', 'servicio')
        .eq('zona', 'buffet')
        .is('deleted_at', null)
        .single();

      if (error) return null;
      const row = data as unknown as RecetaWithIngsRow;

      const ingredientes: DespachoIngrediente[] = (row.receta_ingredientes ?? []).map((ri) => ({
        insumoId: ri.insumo_id,
        insumoNombre: ri.insumo?.nombre ?? '',
        cantidadPorBatch: Number(ri.cantidad),
        mermaCoeficiente: Number(ri.merma_coeficiente),
      }));

      return { id: row.id, nombre: row.nombre, porciones: row.porciones, ingredientes };
    },

    async createDespacho(
      tenantId: string,
      input: CreateDespachoBuffetInput & { responsableId: string },
    ): Promise<DespachoBuffet> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('despachos')
        .insert({
          tenant_id: tenantId,
          receta_id: input.recetaId,
          turno_id: input.turnoId ?? null,
          zona: 'buffet',
          cantidad: input.cantidad,
          responsable_id: input.responsableId,
          idempotency_key: input.idempotencyKey,
        })
        .select(DESPACHO_SELECT)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError('DUPLICATE_OPERATION', 409, 'Operación duplicada (idempotency key)');
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toDespacho(data as unknown as DespachoRow);
    },

    async findTicketsByTurno(tenantId: string, turnoId: string): Promise<TicketTurno[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('buffet_tickets_turno')
        .select(
          `id, tenant_id, turno_id, cantidad_tickets, registrado_por, idempotency_key, created_at,
           turno:turnos(nombre)`,
        )
        .eq('tenant_id', tenantId)
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as TicketRow[]).map(toTicket);
    },

    async createTickets(
      tenantId: string,
      input: CreateTicketsTurnoInput & { registradoPor: string },
    ): Promise<TicketTurno> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('buffet_tickets_turno')
        .insert({
          tenant_id: tenantId,
          turno_id: input.turnoId,
          cantidad_tickets: input.cantidadTickets,
          registrado_por: input.registradoPor,
          idempotency_key: input.idempotencyKey,
        })
        .select(
          `id, tenant_id, turno_id, cantidad_tickets, registrado_por, idempotency_key, created_at,
           turno:turnos(nombre)`,
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError('DUPLICATE_OPERATION', 409, 'Operación duplicada (idempotency key)');
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toTicket(data as unknown as TicketRow);
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

    async findRecetasServicioBuffet(
      tenantId: string,
    ): Promise<Pick<RecetaServicioBuffet, 'id' | 'nombre' | 'porciones'>[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('recetas')
        .select('id, nombre, porciones')
        .eq('tenant_id', tenantId)
        .eq('tipo_receta', 'servicio')
        .eq('zona', 'buffet')
        .is('deleted_at', null)
        .order('nombre');

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return data as Pick<RecetaServicioBuffet, 'id' | 'nombre' | 'porciones'>[];
    },
  };
}
