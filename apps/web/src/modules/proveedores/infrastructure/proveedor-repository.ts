import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

async function resolveTenantInfo(
  admin: ReturnType<typeof createAdminClient>,
  rows: ProveedorRow[],
): Promise<Record<string, { nombre: string; slug: string }>> {
  const ids = Array.from(new Set(rows.map((r) => r.tenant_id)));
  if (ids.length === 0) return {};
  const { data } = await admin.from('tenants').select('id, nombre, slug').in('id', ids);
  return Object.fromEntries(
    (data ?? []).map((t) => [t.id, { nombre: t.nombre as string, slug: t.slug as string }]),
  );
}

function toProveedor(
  row: ProveedorRow,
  tenantMap: Record<string, { nombre: string; slug: string }>,
): Proveedor {
  const tenant = tenantMap[row.tenant_id];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantNombre: tenant?.nombre ?? null,
    tenantSlug: tenant?.slug ?? null,
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

// tenantId=null usa admin client (bypassea RLS) — la validación de rol ocurre
// en la action vía assertCan, este repo confía en el scope que recibe.
export function createProveedorRepository(): ProveedorRepository {
  return {
    async findAll(tenantId): Promise<Proveedor[]> {
      const admin = createAdminClient();
      let q: any;
      if (tenantId === null) {
        q = admin
          .from('proveedores')
          .select(SELECT_FIELDS)
          .is('deleted_at', null)
          .order('nombre', { ascending: true });
      } else {
        const supabase = await createClient();
        q = supabase
          .from('proveedores')
          .select(SELECT_FIELDS)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .order('nombre', { ascending: true });
      }
      const { data, error } = await q;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as ProveedorRow[];
      const tenantMap = await resolveTenantInfo(admin, rows);
      return rows.map((r) => toProveedor(r, tenantMap));
    },

    async findById(id, tenantId): Promise<Proveedor | null> {
      const admin = createAdminClient();
      let q: any;
      if (tenantId === null) {
        q = admin
          .from('proveedores')
          .select(SELECT_FIELDS)
          .eq('id', id)
          .is('deleted_at', null)
          .maybeSingle();
      } else {
        const supabase = await createClient();
        q = supabase
          .from('proveedores')
          .select(SELECT_FIELDS)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .maybeSingle();
      }
      const { data, error } = await q;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      if (!data) return null;
      const row = data as ProveedorRow;
      const tenantMap = await resolveTenantInfo(admin, [row]);
      return toProveedor(row, tenantMap);
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
      const row = data as ProveedorRow;
      const admin = createAdminClient();
      const tenantMap = await resolveTenantInfo(admin, [row]);
      return toProveedor(row, tenantMap);
    },

    async update(id, tenantId, input): Promise<Proveedor> {
      const patch: Record<string, unknown> = {};
      if (input.nombre !== undefined) patch['nombre'] = input.nombre;
      if ('contacto' in input) patch['contacto'] = input.contacto ?? null;
      if ('telefono' in input) patch['telefono'] = input.telefono ?? null;
      if ('email' in input) patch['email'] = input.email ?? null;
      if ('notas' in input) patch['notas'] = input.notas ?? null;
      if (input.activo !== undefined) patch['activo'] = input.activo;

      const admin = createAdminClient();
      let q: any;
      if (tenantId === null) {
        q = admin.from('proveedores').update(patch).eq('id', id).select(SELECT_FIELDS).single();
      } else {
        const supabase = await createClient();
        q = supabase
          .from('proveedores')
          .update(patch)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select(SELECT_FIELDS)
          .single();
      }
      const { data, error } = await q;
      if (error?.code === 'PGRST116')
        throw new AppError('NOT_FOUND', 404, 'Proveedor no encontrado');
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const row = data as ProveedorRow;
      const tenantMap = await resolveTenantInfo(admin, [row]);
      return toProveedor(row, tenantMap);
    },

    async findLotesByProveedor(proveedorId, tenantId): Promise<LoteConInsumo[]> {
      let q: any;
      const LOTE_SELECT =
        'id, tenant_id, insumo_id, codigo, cantidad_inicial, cantidad_actual, fecha_recibido, fecha_vencimiento, proveedor, proveedor_id, costo_unitario, cantidad_empaques, peso_unitario, unidad_peso, activo, created_at, insumo:insumos(nombre), proveedor_rel:proveedores(nombre)';
      if (tenantId === null) {
        const admin = createAdminClient();
        q = admin
          .from('lotes')
          .select(LOTE_SELECT)
          .eq('proveedor_id', proveedorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
      } else {
        const supabase = await createClient();
        q = supabase
          .from('lotes')
          .select(LOTE_SELECT)
          .eq('tenant_id', tenantId)
          .eq('proveedor_id', proveedorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });
      }
      const { data, error } = await q;
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as unknown as LoteRow[]).map(toLoteConInsumo);
    },
  };
}
