import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { RecipeRepository } from '../application/ports/recipe-repository.port';
import type {
  Receta,
  RecetaIngrediente,
  RecetaWithIngredientes,
  CreateRecetaInput,
  AddIngredienteInput,
} from '../domain/recipe';

type IngredienteRow = {
  id: string;
  receta_id: string;
  insumo_id: string;
  cantidad: number;
  merma_coeficiente: number;
  insumo: { nombre: string; unidad_medida: string } | null;
};

type RecetaRow = {
  id: string;
  tenant_id: string;
  nombre: string;
  tipo_receta: string;
  zona: string | null;
  insumo_destino_id: string | null;
  porciones: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
  insumo_destino: { nombre: string } | null;
  receta_ingredientes: IngredienteRow[];
};

function toRecetaWithIngredientes(row: RecetaRow): RecetaWithIngredientes {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    tipoReceta: row.tipo_receta as RecetaWithIngredientes['tipoReceta'],
    zona: row.zona as RecetaWithIngredientes['zona'],
    insumoDestinoId: row.insumo_destino_id,
    insumoDestinoNombre: row.insumo_destino?.nombre ?? null,
    porciones: row.porciones,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ingredientes: (row.receta_ingredientes ?? []).map((ri) => ({
      id: ri.id,
      recetaId: ri.receta_id,
      insumoId: ri.insumo_id,
      insumoNombre: ri.insumo?.nombre ?? '',
      unidadMedida: ri.insumo?.unidad_medida ?? '',
      cantidad: Number(ri.cantidad),
      mermaCoeficiente: Number(ri.merma_coeficiente),
    })),
  };
}

function toReceta(row: Omit<RecetaRow, 'receta_ingredientes' | 'insumo_destino'>): Receta {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    tipoReceta: row.tipo_receta as Receta['tipoReceta'],
    zona: row.zona as Receta['zona'],
    insumoDestinoId: row.insumo_destino_id,
    porciones: row.porciones,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createRecipeRepository(): RecipeRepository {
  return {
    async findAll(tenantId: string): Promise<RecetaWithIngredientes[]> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('recetas')
        .select(
          `
          id, tenant_id, nombre, tipo_receta, zona, insumo_destino_id, porciones, activo, created_at, updated_at,
          insumo_destino:insumos!recetas_insumo_destino_id_fkey(nombre),
          receta_ingredientes(
            id, receta_id, insumo_id, cantidad, merma_coeficiente,
            insumo:insumos(nombre, unidad_medida)
          )
        `,
        )
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .eq('activo', true)
        .order('nombre');

      if (error) {
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return (data as unknown as RecetaRow[]).map(toRecetaWithIngredientes);
    },

    async create(tenantId: string, input: CreateRecetaInput): Promise<Receta> {
      const supabase = createClient();

      const insert =
        input.tipoReceta === 'produccion'
          ? {
              tenant_id: tenantId,
              nombre: input.nombre,
              tipo_receta: 'produccion' as const,
              insumo_destino_id: input.insumoDestinoId,
              porciones: input.porciones,
            }
          : {
              tenant_id: tenantId,
              nombre: input.nombre,
              tipo_receta: 'servicio' as const,
              zona: input.zona,
              porciones: input.porciones,
            };

      const { data, error } = await supabase
        .from('recetas')
        .insert(insert)
        .select(
          'id, tenant_id, nombre, tipo_receta, zona, insumo_destino_id, porciones, activo, created_at, updated_at',
        )
        .single();

      if (error) {
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toReceta(data as unknown as Omit<RecetaRow, 'receta_ingredientes' | 'insumo_destino'>);
    },

    async addIngrediente(tenantId: string, input: AddIngredienteInput): Promise<RecetaIngrediente> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('receta_ingredientes')
        .insert({
          tenant_id: tenantId,
          receta_id: input.recetaId,
          insumo_id: input.insumoId,
          cantidad: input.cantidad,
          merma_coeficiente: input.mermaCoeficiente,
        })
        .select(
          'id, receta_id, insumo_id, cantidad, merma_coeficiente, insumo:insumos(nombre, unidad_medida)',
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            'DUPLICATE_INGREDIENTE',
            409,
            'Este insumo ya es ingrediente de esta receta',
          );
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      const row = data as unknown as IngredienteRow & { receta_id: string };
      return {
        id: row.id,
        recetaId: row.receta_id,
        insumoId: row.insumo_id,
        insumoNombre: row.insumo?.nombre ?? '',
        unidadMedida: row.insumo?.unidad_medida ?? '',
        cantidad: Number(row.cantidad),
        mermaCoeficiente: Number(row.merma_coeficiente),
      };
    },
  };
}
