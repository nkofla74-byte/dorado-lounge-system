import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type {
  ProveedorRepository,
  LoteConInsumo,
} from '../application/ports/proveedor-repository.port';
import type { Proveedor, CreateProveedorInput, UpdateProveedorInput } from '../domain/proveedor';

type ProveedorRow = {
  id: string;
  tenant_id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
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
  insumo: { nombre: string } | null;
  proveedor_rel: { nombre: string } | null;
};

const SELECT_FIELDS =
  'id, tenant_id, nombre, contacto, telefono, email, notas, activo, created_at, updated_at';

function toProveedor(row: ProveedorRow): Proveedor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nombre: row.nombre,
    contacto: row.contacto,
    telefono: row.telefono,
    email: row.email,
    notas: row.notas,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toLoteConInsumo(row: LoteRow): LoteConInsumo {
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
    costoUnitario: row.costo_unitario != null ? Number(row.costo_unitario) : null,
    cantidadEmpaques: row.cantidad_empaques != null ? Number(row.cantidad_empaques) : null,
    pesoUnitario: row.peso_unitario != null ? Number(row.peso_unitario) : null,
    unidadPeso: (row.unidad_peso as LoteConInsumo['unidadPeso']) ?? null,
    activo: row.activo,
    createdAt: new Date(row.created_at),
    insumoNombre: row.insumo?.nombre ?? '',
    proveedorNombre: row.proveedor_rel?.nombre ?? null,
  };
}

export function createProveedorRepository(): ProveedorRepository {
  return {
    async findAll(tenantId: string): Promise<Proveedor[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('proveedores')
        .select(SELECT_FIELDS)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('nombre', { ascending: true });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as ProveedorRow[]).map(toProveedor);
    },

    async findById(id: string, tenantId: string): Promise<Proveedor | null> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('proveedores')
        .select(SELECT_FIELDS)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return data ? toProveedor(data as ProveedorRow) : null;
    },

    async create(tenantId: string, input: CreateProveedorInput): Promise<Proveedor> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('proveedores')
        .insert({
          tenant_id: tenantId,
          nombre: input.nombre,
          contacto: input.contacto ?? null,
          telefono: input.telefono ?? null,
          email: input.email ?? null,
          notas: input.notas ?? null,
        })
        .select(SELECT_FIELDS)
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toProveedor(data as ProveedorRow);
    },

    async update(id: string, tenantId: string, input: UpdateProveedorInput): Promise<Proveedor> {
      const supabase = await createClient();
      const patch: Record<string, unknown> = {};
      if (input.nombre !== undefined) patch['nombre'] = input.nombre;
      if ('contacto' in input) patch['contacto'] = input.contacto ?? null;
      if ('telefono' in input) patch['telefono'] = input.telefono ?? null;
      if ('email' in input) patch['email'] = input.email ?? null;
      if ('notas' in input) patch['notas'] = input.notas ?? null;
      if (input.activo !== undefined) patch['activo'] = input.activo;

      const { data, error } = await supabase
        .from('proveedores')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select(SELECT_FIELDS)
        .single();

      if (error?.code === 'PGRST116')
        throw new AppError('NOT_FOUND', 404, 'Proveedor no encontrado');
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toProveedor(data as ProveedorRow);
    },

    async findLotesByProveedor(proveedorId: string, tenantId: string): Promise<LoteConInsumo[]> {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('lotes')
        .select(
          'id, tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual, fecha_recibido, fecha_vencimiento, proveedor, proveedor_id, costo_unitario, cantidad_empaques, peso_unitario, unidad_peso, activo, created_at, insumo:insumos(nombre), proveedor_rel:proveedores(nombre)',
        )
        .eq('tenant_id', tenantId)
        .eq('proveedor_id', proveedorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as LoteRow[]).map(toLoteConInsumo);
    },
  };
}
