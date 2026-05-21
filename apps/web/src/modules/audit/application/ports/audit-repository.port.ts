import type { AuditEntry, AuditFilters } from '../../domain/audit-entry';

// tenantId=null → sin filtro (vista global, solo para superuser).
export interface AuditRepository {
  findAll(tenantId: string | null, filters?: AuditFilters): Promise<AuditEntry[]>;
  count(tenantId: string | null, filters?: AuditFilters): Promise<number>;
}
