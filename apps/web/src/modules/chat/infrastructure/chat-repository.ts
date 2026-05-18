import { createClient } from '@/lib/supabase/server';
import type { ChatRepository } from '../application/ports/chat-repository.port';
import type { Mensaje, EnviarMensajeInput } from '../domain/mensaje';
import { AppError } from '@/lib/result';

interface MensajeRow {
  id: string;
  tenant_id: string;
  canal: string;
  remitente_id: string;
  contenido: string;
  tipo: string;
  created_at: string;
  users: { full_name: string | null; email: string } | null;
}

function toMensaje(row: MensajeRow): Mensaje {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    canal: row.canal as Mensaje['canal'],
    remitenteId: row.remitente_id,
    remitenteNombre: row.users?.full_name ?? row.users?.email ?? 'Desconocido',
    contenido: row.contenido,
    tipo: row.tipo as Mensaje['tipo'],
    createdAt: new Date(row.created_at),
  };
}

export function createChatRepository(): ChatRepository {
  return {
    async getMensajes(tenantId, canal, limit = 50) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('mensajes_chat')
        .select('*, users(full_name, email)')
        .eq('tenant_id', tenantId)
        .eq('canal', canal)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return (data as MensajeRow[]).map(toMensaje);
    },

    async enviarMensaje(tenantId, remitenteId, _remitenteNombre, input) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('mensajes_chat')
        .insert({
          tenant_id: tenantId,
          canal: input.canal,
          remitente_id: remitenteId,
          contenido: input.contenido.trim(),
          tipo: input.tipo ?? 'text',
        })
        .select('*, users(full_name, email)')
        .single();

      if (error) throw new AppError('DB_ERROR', 500, error.message);
      return toMensaje(data as MensajeRow);
    },
  };
}
