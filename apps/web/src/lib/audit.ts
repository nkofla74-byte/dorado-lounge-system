'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logger';

const log = createLogger('audit');

export interface AuditParams {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
}

// Registra una entrada en audit_log. Los errores se capturan sin interrumpir
// la operación principal: un fallo de auditoría nunca debe romper la acción.
export async function auditLog(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId ?? null,
      payload: params.payload ?? {},
      ip_address: params.ipAddress ?? null,
    });

    if (error) {
      log.error('Error al insertar en audit_log', { message: error.message });
    }
  } catch (e) {
    log.error('Excepción inesperada', { error: String(e) });
  }
}
