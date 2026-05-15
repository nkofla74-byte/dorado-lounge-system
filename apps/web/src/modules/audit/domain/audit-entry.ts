export interface AuditEntry {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userNombre: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  prevHash: string | null;
  hash: string | null;
  createdAt: Date;
}

export interface AuditFilters {
  action?: string | undefined;
  resourceType?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}
