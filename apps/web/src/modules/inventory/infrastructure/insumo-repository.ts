import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { UnidadMedida } from '@dorado/shared-types';
import type { InsumoRepository } from '../application/ports/insumo-repository.port';
import type {
  Insumo,
  InsumoWithStock,
  CreateInsumoInput,
  Lote,
  CreateLoteInput,
} from '../domain/insumo';

type LoteStockRow = {
  cantidad_actual: number;
  activo: boolean;
  deleted_at: string | null;
};

type LoteRow = {
  id: string;
  tenant_id: string;
  insumo_id: string;
  codigo: string;
  cantidad_inicial: number;
  cantidad_actual: number;
  fecha_recibido: string;
  fecha_vencimiento: string | null;
  proveedor: string | null;
  proveedor_id: string | null;
  costo_unitario: number | null;
  cantidad_empaques: number | null;
  peso_unitario: number | null;
  unidad_peso: string | null;
  activo: boolean;
  created_at: string;
};

const LOTE_COLUMNS =
  'id, tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual, fecha_recibido, fecha_vencimiento, proveedor, proveedor_id, costo_unitario, cantidad_empaques, peso_unitario, unidad_peso, activo, created_at';

function toLote(row: LoteRow): Lote {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    insumoId: row.insumo_id,
    codigo: row.codigo,
    cantidadInicial: Number(row.cantidad_inicial),
    cantidadActual: Number(row.cantidad_actual),
    fechaRecibido: row.fecha_recibido,
    fechaVencimiento: row.fecha_vencimiento,
    proveedor: row.proveedor,
    proveedorId: row.proveedor_id,
    costoUnitario: row.costo_unitario !== null ? Number(row.costo_unitario) : null,
    cantidadEmpaques: row.cantidad_empaques !== null ? Number(row.cantidad_empaques) : null,
    pesoUnitario: row.peso_unitario !== null ? Number(row.peso_unitario) : null,
    unidadPeso: (row.unidad_peso as UnidadMedida | null) ?? null,
    activo: row.activo,
    createdAt: new Date(row.created_at),
  };
}

type InsumoRow = {
  id: string;
  tenant_id: string;
  nombre: string;
  codigo: string;
  capa: string;
  unidad_medida: string;
  stock_minimo: number;
  merma_default: number;
  activo: boolean;
  created_at: string;
  lotes: LoteStockRow[] | null;
};

function toInsumoWithStock(row: InsumoRow): InsumoWithStock {
  const stockActual = (row.lotes ?? [])
    .filter((l) => l.activo && !l.deleted_at)
    .reduce((sum, l) => sum + Number(l.cantidad_actual), 0);

  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    codigo: row.codigo,
    capa: row.capa as InsumoWithStock['capa'],
    unidadMedida: row.unidad_medida as InsumoWithStock['unidadMedida'],
    stockMinimo: Number(row.stock_minimo),
    mermaDefault: Number(row.merma_default),
    activo: row.activo,
    createdAt: new Date(row.created_at),
    stockActual,
  };
}

function toInsumo(row: Omit<InsumoRow, 'lotes'>): Insumo {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    codigo: row.codigo,
    capa: row.capa as Insumo['capa'],
    unidadMedida: row.unidad_medida as Insumo['unidadMedida'],
    stockMinimo: Number(row.stock_minimo),
    mermaDefault: Number(row.merma_default),
    activo: row.activo,
    createdAt: new Date(row.created_at),
  };
}

export function createInsumoRepository(): InsumoRepository {
  return {
    async findAll(): Promise<InsumoWithStock[]> {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('insumos')
        .select(
          'id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, merma_default, activo, created_at, lotes(cantidad_actual, activo, deleted_at)',
        )
        .is('deleted_at', null)
        .eq('activo', true)
        .order('nombre');

      if (error) {
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return (data as unknown as InsumoRow[]).map(toInsumoWithStock);
    },

    async create(tenantId: string, input: CreateInsumoInput): Promise<Insumo> {
      const supabase = await createClient();

      let codigo = input.codigo ?? null;
      if (!codigo) {
        const { data: codigoData, error: codigoErr } = await supabase.rpc(
          'fn_siguiente_codigo_insumo',
          { p_tenant: tenantId },
        );
        if (codigoErr) throw new AppError('DB_ERROR', 500, codigoErr.message);
        codigo = codigoData as string;
      }

      const { data, error } = await supabase
        .from('insumos')
        .insert({
          tenant_id: tenantId,
          nombre: input.nombre,
          codigo,
          capa: input.capa,
          unidad_medida: input.unidadMedida,
          stock_minimo: input.stockMinimo,
          merma_default: input.mermaDefault,
        })
        .select(
          'id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, merma_default, activo, created_at',
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            'DUPLICATE_CODIGO',
            409,
            `El código '${codigo}' ya existe para este tenant`,
          );
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toInsumo(data as unknown as Omit<InsumoRow, 'lotes'>);
    },

    async findLotesByInsumo(insumoId: string): Promise<Lote[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('lotes')
        .select(LOTE_COLUMNS)
        .eq('insumo_id', insumoId)
        .is('deleted_at', null)
        .eq('activo', true)
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as LoteRow[]).map(toLote);
    },

    async createLote(tenantId: string, input: CreateLoteInput): Promise<Lote> {
      const supabase = await createClient();

      const { data: codigoData, error: codigoErr } = await supabase.rpc(
        'fn_siguiente_codigo_lote',
        { p_tenant: tenantId },
      );
      if (codigoErr) throw new AppError('DB_ERROR', 500, codigoErr.message);

      const { data, error } = await supabase
        .from('lotes')
        .insert({
          tenant_id: tenantId,
          insumo_id: input.insumoId,
          codigo: codigoData as string,
          cantidad_inicial: input.cantidadInicial,
          cantidad_actual: input.cantidadInicial,
          fecha_vencimiento: input.fechaVencimiento ?? null,
          proveedor: input.proveedor ?? null,
          proveedor_id: input.proveedorId ?? null,
          costo_unitario: input.costoUnitario ?? null,
          cantidad_empaques: input.cantidadEmpaques ?? null,
          peso_unitario: input.pesoUnitario ?? null,
          unidad_peso: input.unidadPeso ?? null,
        })
        .select(LOTE_COLUMNS)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toLote(data as unknown as LoteRow);
    },
  };
}
