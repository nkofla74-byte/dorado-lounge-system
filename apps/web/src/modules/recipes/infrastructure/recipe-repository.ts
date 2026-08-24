import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { UnidadMedida } from '@dorado/shared-types';
import type { RecipeRepository } from '../application/ports/recipe-repository.port';
import type {
  Receta,
  RecetaIngrediente,
  RecetaWithIngredientes,
  CreateRecetaInput,
  AddIngredienteInput,
  UpdateMenuMetaInput,
} from '../domain/recipe';

type IngredienteRow = {
  id: string;
  receta_id: string;
  insumo_id: string;
  cantidad: number;
  unidad_display: string | null;
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
  area_produccion: string | null;
  porciones: number;
  rendimiento_cantidad: number | null;
  categoria_menu: string | null;
  descripcion: string | null;
  imagen_url: string | null;
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
    areaProduccion: row.area_produccion as RecetaWithIngredientes['areaProduccion'],
    porciones: row.porciones,
    rendimientoCantidad:
      row.rendimiento_cantidad === null ? null : Number(row.rendimiento_cantidad),
    categoriaMenu: (row.categoria_menu as RecetaWithIngredientes['categoriaMenu']) ?? null,
    descripcion: row.descripcion ?? null,
    imagenUrl: row.imagen_url ?? null,
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
      unidadDisplay: (ri.unidad_display as UnidadMedida | null) ?? null,
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
    areaProduccion: row.area_produccion as Receta['areaProduccion'],
    porciones: row.porciones,
    rendimientoCantidad:
      row.rendimiento_cantidad === null ? null : Number(row.rendimiento_cantidad),
    categoriaMenu: (row.categoria_menu as Receta['categoriaMenu']) ?? null,
    descripcion: row.descripcion ?? null,
    imagenUrl: row.imagen_url ?? null,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createRecipeRepository(): RecipeRepository {
  return {
    async findAll(tenantId: string): Promise<RecetaWithIngredientes[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('recetas')
        .select(
          `
          id, tenant_id, nombre, tipo_receta, zona, insumo_destino_id, area_produccion, porciones, rendimiento_cantidad, categoria_menu, descripcion, imagen_url, activo, created_at, updated_at,
          insumo_destino:insumos!recetas_insumo_destino_id_fkey(nombre),
          receta_ingredientes(
            id, receta_id, insumo_id, cantidad, unidad_display, merma_coeficiente,
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
      const supabase = await createClient();

      const base = {
        tenant_id: tenantId,
        nombre: input.nombre,
        porciones: input.porciones,
        descripcion: input.descripcion ?? null,
      };
      const insert =
        input.tipoReceta === 'produccion'
          ? {
              ...base,
              tipo_receta: 'produccion' as const,
              insumo_destino_id: input.insumoDestinoId,
              // Obligatorio en base desde F-037: sin rendimiento no se puede
              // materializar el elaborado al completar la tanda.
              rendimiento_cantidad: input.rendimientoCantidad,
            }
          : {
              ...base,
              tipo_receta: 'servicio' as const,
              zona: input.zona,
              categoria_menu: input.categoriaMenu ?? null,
            };

      const { data, error } = await supabase
        .from('recetas')
        .insert(insert)
        .select(
          'id, tenant_id, nombre, tipo_receta, zona, insumo_destino_id, area_produccion, porciones, rendimiento_cantidad, categoria_menu, descripcion, imagen_url, activo, created_at, updated_at',
        )
        .single();

      if (error) {
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toReceta(data as unknown as Omit<RecetaRow, 'receta_ingredientes' | 'insumo_destino'>);
    },

    async addIngrediente(tenantId: string, input: AddIngredienteInput): Promise<RecetaIngrediente> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('receta_ingredientes')
        .insert({
          tenant_id: tenantId,
          receta_id: input.recetaId,
          insumo_id: input.insumoId,
          cantidad: input.cantidad,
          unidad_display: input.unidadDisplay,
          merma_coeficiente: input.mermaCoeficiente,
        })
        .select(
          'id, receta_id, insumo_id, cantidad, unidad_display, merma_coeficiente, insumo:insumos(nombre, unidad_medida)',
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
        unidadDisplay: (row.unidad_display as UnidadMedida | null) ?? null,
        mermaCoeficiente: Number(row.merma_coeficiente),
      };
    },

    async updateMenuMeta(tenantId: string, input: UpdateMenuMetaInput): Promise<void> {
      const supabase = await createClient();

      const { error } = await supabase
        .from('recetas')
        .update({
          categoria_menu: input.categoriaMenu,
          descripcion: input.descripcion,
          imagen_url: input.imagenUrl,
        })
        .eq('id', input.recetaId)
        .eq('tenant_id', tenantId);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
    },
  };
}
