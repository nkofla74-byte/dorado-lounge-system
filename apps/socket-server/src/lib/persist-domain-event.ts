import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

export interface DomainEventInput {
  tenantId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdBy: string | null;
}

export async function persistDomainEvent(
  supabase: SupabaseClient,
  input: DomainEventInput,
): Promise<void> {
  const { error } = await supabase.from('domain_events').insert({
    tenant_id: input.tenantId,
    aggregate_id: input.aggregateId,
    aggregate_type: input.aggregateType,
    event_type: input.eventType,
    payload: input.payload,
    created_by: input.createdBy,
  });

  if (error) {
    logger.error({
      event: 'domain_event_persist_error',
      eventType: input.eventType,
      error: error.message,
    });
  }
}
