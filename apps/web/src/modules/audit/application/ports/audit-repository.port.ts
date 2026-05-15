import type { AuditEntry, AuditFilters } from '../../domain/audit-entry';

export interface AuditRepository {
  findAll(tenantId: string, filters?: AuditFilters): Promise<AuditEntry[]>;
  count(tenantId: string, filters?: AuditFilters): Promise<number>;
}
