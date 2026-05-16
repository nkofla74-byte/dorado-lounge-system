import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/result';
import type { AuditRepository } from '../application/ports/audit-repository.port';
import type { AuditEntry, AuditFilters } from '../domain/audit-entry';

type AuditRow = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  prev_hash: string | null;
  hash: string | null;
  created_at: string;
};

// Supabase PostgrestFilterBuilder generics change with each chained method call,
// making typed dynamic filter accumulation impractical.
type FilterChain = any;

function applyFilters(q: FilterChain, filters: AuditFilters | undefined): FilterChain {
  let builder: FilterChain = q;
  if (filters?.action) builder = builder.ilike('action', `%${filters.action}%`);
  if (filters?.resourceType) builder = builder.eq('resource_type', filters.resourceType);
  if (filters?.desde) builder = builder.gte('created_at', filters.desde);
  if (filters?.hasta) builder = builder.lte('created_at', filters.hasta);
  return builder;
}

function buildQuery(
  tenantId: string,
  filters: AuditFilters | undefined,
  admin: ReturnType<typeof createAdminClient>,
): FilterChain {
  const base = admin
    .from('audit_log')
    .select(
      'id, tenant_id, user_id, action, resource_type, resource_id, payload, ip_address, prev_hash, hash, created_at',
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return applyFilters(base, filters);
}

function buildCountQuery(
  tenantId: string,
  filters: AuditFilters | undefined,
  admin: ReturnType<typeof createAdminClient>,
): FilterChain {
  const base = admin
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  return applyFilters(base, filters);
}

async function resolveUserNames(
  admin: ReturnType<typeof createAdminClient>,
  rows: AuditRow[],
): Promise<Record<string, string>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => id != null)),
  );
  if (ids.length === 0) return {};
  const { data } = await admin.from('users').select('id, nombre').in('id', ids);
  return Object.fromEntries((data ?? []).map((u) => [u.id, u.nombre as string]));
}

function toEntry(row: AuditRow, nameMap: Record<string, string>): AuditEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    userNombre: row.user_id ? (nameMap[row.user_id] ?? null) : null,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    payload: row.payload ?? {},
    ipAddress: row.ip_address,
    prevHash: row.prev_hash,
    hash: row.hash,
    createdAt: new Date(row.created_at),
  };
}

export function createAuditRepository(): AuditRepository {
  return {
    async findAll(tenantId, filters) {
      const admin = createAdminClient();
      const limit = filters?.limit ?? 100;
      const offset = filters?.offset ?? 0;

      const { data, error } = await buildQuery(tenantId, filters, admin).range(
        offset,
        offset + limit - 1,
      );

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      const rows = (data ?? []) as AuditRow[];
      const nameMap = await resolveUserNames(admin, rows);
      return rows.map((r) => toEntry(r, nameMap));
    },

    async count(tenantId, filters) {
      const admin = createAdminClient();
      const { count, error } = await buildCountQuery(tenantId, filters, admin);
      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return count ?? 0;
    },
  };
}
