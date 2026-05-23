import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { ProductionRepository } from '../application/ports/production-repository.port';
import type {
  Tanda,
  TandaWithIngredientes,
  CreateTandaInput,
  EstadoTanda,
  ZonaServicio,
} from '../domain/tanda';

const TANDA_COLUMNS = `
  id, tenant_id, receta_id, cantidad_tandas, estado, zona_destino, responsable_id, turno_id, notas, started_at, completed_at, created_at, updated_at,
  receta:recetas(nombre),
  responsable:users!tandas_produccion_responsable_id_fkey(nombre),
  turno:turnos(nombre)
`;

type TandaRow = {
  id: string;
  tenant_id: string;
  receta_id: string;
  cantidad_tandas: number;
  estado: string;
  zona_destino: string | null;
  responsable_id: string | null;
  turno_id: string | null;
  notas: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  receta: { nombre: string } | null;
  responsable: { nombre: string } | null;
  turno: { nombre: string } | null;
};

type TandaWithIngsRow = TandaRow & {
  receta: {
    nombre: string;
    receta_ingredientes: {
      insumo_id: string;
      cantidad: number;
      merma_coeficiente: number;
      insumo: { nombre: string } | null;
    }[];
  } | null;
};

function toTanda(row: TandaRow): Tanda {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    recetaId: row.receta_id,
    recetaNombre: row.receta?.nombre ?? '',
    cantidadTandas: row.cantidad_tandas,
    estado: row.estado as EstadoTanda,
    zonaDestino: row.zona_destino as ZonaServicio | null,
    responsableId: row.responsable_id,
    responsableNombre: row.responsable?.nombre ?? null,
    turnoId: row.turno_id,
    turnoNombre: row.turno?.nombre ?? null,
    notas: row.notas,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toTandaWithIngredientes(row: TandaWithIngsRow): TandaWithIngredientes {
  return {
    ...toTanda(row),
    ingredientes: (row.receta?.receta_ingredientes ?? []).map((ri) => ({
      insumoId: ri.insumo_id,
      insumoNombre: ri.insumo?.nombre ?? '',
      cantidad: Number(ri.cantidad),
      mermaCoeficiente: Number(ri.merma_coeficiente),
    })),
  };
}

export function createProductionRepository(): ProductionRepository {
  return {
    async findAll(tenantId: string): Promise<Tanda[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('tandas_produccion')
        .select(TANDA_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      return (data as unknown as TandaRow[]).map(toTanda);
    },

    async create(tenantId: string, input: CreateTandaInput): Promise<Tanda> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('tandas_produccion')
        .insert({
          tenant_id: tenantId,
          receta_id: input.recetaId,
          turno_id: input.turnoId ?? null,
          responsable_id: input.responsableId ?? null,
          cantidad_tandas: input.cantidadTandas,
          zona_destino: input.zonaDestino,
          notas: input.notas ?? null,
          idempotency_key: input.idempotencyKey,
        })
        .select(TANDA_COLUMNS)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            'DUPLICATE_TANDA',
            409,
            'Operación duplicada: esta tanda ya fue creada',
          );
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toTanda(data as unknown as TandaRow);
    },

    async findByIdWithIngredientes(
      id: string,
      tenantId: string,
    ): Promise<TandaWithIngredientes | null> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('tandas_produccion')
        .select(
          `
          id, tenant_id, receta_id, cantidad_tandas, estado, zona_destino, responsable_id, turno_id, notas, started_at, completed_at, created_at, updated_at,
          receta:recetas(
            nombre,
            receta_ingredientes(insumo_id, cantidad, merma_coeficiente, insumo:insumos(nombre))
          ),
          responsable:users!tandas_produccion_responsable_id_fkey(nombre),
          turno:turnos(nombre)
        `,
        )
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toTandaWithIngredientes(data as unknown as TandaWithIngsRow);
    },

    async updateEstado(id: string, tenantId: string, estado: EstadoTanda): Promise<Tanda> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('tandas_produccion')
        .update({ estado })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(TANDA_COLUMNS)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);

      return toTanda(data as unknown as TandaRow);
    },
  };
}
