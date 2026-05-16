import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
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
  cantidad_inicial: number;
  cantidad_actual: number;
  fecha_recibido: string;
  fecha_vencimiento: string | null;
  proveedor: string | null;
  proveedor_id: string | null;
  costo_unitario: number | null;
  activo: boolean;
  created_at: string;
};

function toLote(row: LoteRow): Lote {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    insumoId: row.insumo_id,
    cantidadInicial: Number(row.cantidad_inicial),
    cantidadActual: Number(row.cantidad_actual),
    fechaRecibido: row.fecha_recibido,
    fechaVencimiento: row.fecha_vencimiento,
    proveedor: row.proveedor,
    proveedorId: row.proveedor_id,
    costoUnitario: row.costo_unitario !== null ? Number(row.costo_unitario) : null,
    activo: row.activo,
    createdAt: new Date(row.created_at),
  };
}

type InsumoRow = {
  id: string;
  tenant_id: string;
  nombre: string;
  codigo: string | null;
  capa: string;
  unidad_medida: string;
  stock_minimo: number;
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
    activo: row.activo,
    createdAt: new Date(row.created_at),
  };
}

export function createInsumoRepository(): InsumoRepository {
  return {
    async findAll(): Promise<InsumoWithStock[]> {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('insumos')
        .select(
          'id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, activo, created_at, lotes(cantidad_actual, activo, deleted_at)',
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
      const supabase = createClient();

      const { data, error } = await supabase
        .from('insumos')
        .insert({
          tenant_id: tenantId,
          nombre: input.nombre,
          codigo: input.codigo ?? null,
          capa: input.capa,
          unidad_medida: input.unidadMedida,
          stock_minimo: input.stockMinimo,
        })
        .select(
          'id, tenant_id, nombre, codigo, capa, unidad_medida, stock_minimo, activo, created_at',
        )
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new AppError(
            'DUPLICATE_CODIGO',
            409,
            `El código '${input.codigo}' ya existe para este tenant`,
          );
        }
        throw new AppError('DB_ERROR', 500, error.message);
      }

      return toInsumo(data as unknown as Omit<InsumoRow, 'lotes'>);
    },

    async findLotesByInsumo(insumoId: string): Promise<Lote[]> {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('lotes')
        .select(
          'id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual, fecha_recibido, fecha_vencimiento, proveedor, proveedor_id, costo_unitario, activo, created_at',
        )
        .eq('insumo_id', insumoId)
        .is('deleted_at', null)
        .eq('activo', true)
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as LoteRow[]).map(toLote);
    },

    async createLote(tenantId: string, input: CreateLoteInput): Promise<Lote> {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('lotes')
        .insert({
          tenant_id: tenantId,
          insumo_id: input.insumoId,
          cantidad_inicial: input.cantidadInicial,
          cantidad_actual: input.cantidadInicial,
          fecha_vencimiento: input.fechaVencimiento ?? null,
          proveedor: input.proveedor ?? null,
          proveedor_id: input.proveedorId ?? null,
          costo_unitario: input.costoUnitario ?? null,
        })
        .select(
          'id, tenant_id, insumo_id, cantidad_inicial, cantidad_actual, fecha_recibido, fecha_vencimiento, proveedor, proveedor_id, costo_unitario, activo, created_at',
        )
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toLote(data as unknown as LoteRow);
    },
  };
}
