'use server';

import { assertCan } from '@/lib/auth/assertCan';
import { ok, err, toAppError } from '@/lib/result';
import { auditLog } from '@/lib/audit';
import { emitEvent } from '@/lib/socket/emit-event';
import { createChatRepository } from './infrastructure/chat-repository';
import { getMensajes as getMensajesUseCase } from './application/get-mensajes';
import { enviarMensaje as enviarMensajeUseCase } from './application/enviar-mensaje';
import { CHANNELS } from '@dorado/shared-types';
import type { Result } from '@/lib/result';
import type { Mensaje, EnviarMensajeInput } from './domain/mensaje';

export async function getMensajes(canal: string, limit?: number): Promise<Result<Mensaje[]>> {
  try {
    const ctx = await assertCan('chat:read');
    const repo = createChatRepository();
    return ok(await getMensajesUseCase(repo, ctx.tenantId, canal, limit));
  } catch (e) {
    return err(toAppError(e));
  }
}

export async function enviarMensaje(input: EnviarMensajeInput): Promise<Result<Mensaje>> {
  try {
    const ctx = await assertCan('chat:write');
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const nombre =
      user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? 'Usuario';

    const repo = createChatRepository();
    const mensaje = await enviarMensajeUseCase(repo, ctx.tenantId, ctx.userId, nombre, input);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'chat.mensaje_enviado',
      resourceType: 'mensajes_chat',
      resourceId: mensaje.id,
      payload: { canal: input.canal, tipo: input.tipo ?? 'text' },
    });

    // Broadcast a todos los usuarios del canal vía Socket.io
    await emitEvent(ctx.tenantId, input.canal, {
      type: 'MENSAJE_CHAT',
      payload: {
        mensajeId: mensaje.id,
        tenantId: ctx.tenantId,
        canal: input.canal,
        remitenteId: ctx.userId,
        remitenteNombre: nombre,
        contenido: mensaje.contenido,
        tipo: mensaje.tipo,
        createdAt: mensaje.createdAt.toISOString(),
      },
    });

    return ok(mensaje);
  } catch (e) {
    return err(toAppError(e));
  }
}
