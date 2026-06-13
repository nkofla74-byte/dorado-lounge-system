import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/result';
import type { RequisicionRepository } from '../application/ports/requisicion-repository.port';
import type {
  Requisicion,
  RequisicionWithItems,
  RequisicionItem,
  EstadoRequisicion,
  AreaSolicitante,
} from '../domain/requisicion';

// Columna timestamp que se sella en cada transición de estado.
const ESTADO_TIMESTAMP: Record<EstadoRequisicion, string | null> = {
  solicitada: 'solicitada_at',
  en_alistamiento: 'alistamiento_at',
  despachada: 'despachada_at',
  recibida: 'recibida_at',
  cancelada: 'cancelada_at',
};

const REQUISICION_SELECT = '*, items:requisicion_items(*, insumo:insumos(nombre))';

export function createRequisicionRepository(): RequisicionRepository {
  return {
    async create(tenantId, userId, input) {
      const supabase = await createClient();
      const { data: req, error } = await supabase
        .from('requisiciones')
        .insert({
          tenant_id: tenantId,
          area_solicitante: input.areaSolicitante,
          solicitada_por: userId,
          turno_id: input.turnoId ?? null,
          notas: input.notas ?? null,
          idempotency_key: input.idempotencyKey,
        })
        .select('id')
        .single();
      if (error || !req) {
        throw new AppError(
          'INTERNAL_ERROR',
          500,
          error?.message ?? 'No se pudo crear la requisición',
        );
      }

      const itemsPayload = input.items.map((it) => ({
        tenant_id: tenantId,
        requisicion_id: req.id,
        insumo_id: it.insumoId,
        cantidad_solicitada: it.cantidadSolicitada,
        unidad: it.unidad,
      }));
      const { error: itErr } = await supabase.from('requisicion_items').insert(itemsPayload);
      if (itErr) throw new AppError('INTERNAL_ERROR', 500, itErr.message);

      // Persistencia del evento inicial (append-only).
      await supabase.from('requisicion_eventos').insert({
        tenant_id: tenantId,
        requisicion_id: req.id,
        estado: 'solicitada',
        actor_id: userId,
      });

      const created = await this.findById(req.id, tenantId);
      if (!created) {
        throw new AppError('INTERNAL_ERROR', 500, 'Requisición no encontrada tras crear');
      }
      return created;
    },

    async findById(id, tenantId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select(REQUISICION_SELECT)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();
      return data ? mapRequisicion(data) : null;
    },

    async findColaAlmacen(tenantId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select(REQUISICION_SELECT)
        .eq('tenant_id', tenantId)
        .in('estado', ['solicitada', 'en_alistamiento', 'despachada'])
        .is('deleted_at', null)
        .order('solicitada_at', { ascending: true });
      return (data ?? []).map(mapRequisicion);
    },

    async findByArea(tenantId, area) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('requisiciones')
        .select(REQUISICION_SELECT)
        .eq('tenant_id', tenantId)
        .eq('area_solicitante', area)
        .is('deleted_at', null)
        .order('solicitada_at', { ascending: false });
      return (data ?? []).map(mapRequisicion);
    },

    async transition(id, tenantId, actorId, estado, version) {
      const supabase = await createClient();
      const patch: Record<string, unknown> = {
        estado,
        version: version + 1,
        updated_at: new Date().toISOString(),
      };
      const tsCol = ESTADO_TIMESTAMP[estado];
      if (tsCol) patch[tsCol] = new Date().toISOString();

      const { data, error } = await supabase
        .from('requisiciones')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('version', version) // optimistic locking
        .select('*')
        .maybeSingle();
      if (error) throw new AppError('INTERNAL_ERROR', 500, error.message);
      if (!data) {
        throw new AppError(
          'VERSION_CONFLICT',
          409,
          'La requisición cambió; recarga e intenta de nuevo',
        );
      }

      await supabase.from('requisicion_eventos').insert({
        tenant_id: tenantId,
        requisicion_id: id,
        estado,
        actor_id: actorId,
      });
      return mapRequisicionRow(data);
    },

    async despachar(id, tenantId, actorId, items, version) {
      const supabase = await createClient();
      for (const it of items) {
        const { error } = await supabase
          .from('requisicion_items')
          .update({ cantidad_despachada: it.cantidadDespachada })
          .eq('id', it.itemId)
          .eq('tenant_id', tenantId);
        if (error) throw new AppError('INTERNAL_ERROR', 500, error.message);
      }
      return this.transition(id, tenantId, actorId, 'despachada', version);
    },
  };
}

// ── mapeo snake_case → dominio ────────────────────────────────────────────────
function mapRequisicionRow(row: Record<string, unknown>): Requisicion {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    areaSolicitante: row['area_solicitante'] as AreaSolicitante,
    solicitadaPor: (row['solicitada_por'] as string | null) ?? null,
    turnoId: (row['turno_id'] as string | null) ?? null,
    estado: row['estado'] as EstadoRequisicion,
    notas: (row['notas'] as string | null) ?? null,
    version: row['version'] as number,
    solicitadaAt: new Date(row['solicitada_at'] as string),
    alistamientoAt: row['alistamiento_at'] ? new Date(row['alistamiento_at'] as string) : null,
    despachadaAt: row['despachada_at'] ? new Date(row['despachada_at'] as string) : null,
    recibidaAt: row['recibida_at'] ? new Date(row['recibida_at'] as string) : null,
    canceladaAt: row['cancelada_at'] ? new Date(row['cancelada_at'] as string) : null,
    createdAt: new Date(row['created_at'] as string),
  };
}

function mapRequisicion(row: Record<string, unknown>): RequisicionWithItems {
  const base = mapRequisicionRow(row);
  const rawItems = (row['items'] as Record<string, unknown>[]) ?? [];
  const items: RequisicionItem[] = rawItems.map((it) => ({
    id: it['id'] as string,
    requisicionId: it['requisicion_id'] as string,
    insumoId: it['insumo_id'] as string,
    insumoNombre: (it['insumo'] as { nombre?: string } | null)?.nombre ?? '—',
    cantidadSolicitada: Number(it['cantidad_solicitada']),
    cantidadDespachada: Number(it['cantidad_despachada']),
    unidad: it['unidad'] as RequisicionItem['unidad'],
  }));
  return { ...base, items };
}
