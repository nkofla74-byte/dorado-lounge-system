import type { ChatRepository } from './ports/chat-repository.port';
import type { EnviarMensajeInput, Mensaje } from '../domain/mensaje';
import { AppError } from '@/lib/result';
import { validarContenido } from '../domain/mensaje';

export async function enviarMensaje(
  repo: ChatRepository,
  tenantId: string,
  remitenteId: string,
  remitenteNombre: string,
  input: EnviarMensajeInput,
): Promise<Mensaje> {
  if (!validarContenido(input.contenido)) {
    throw new AppError('INVALID_CONTENT', 400, 'Mensaje vacío o demasiado largo (máx. 1000 chars)');
  }
  return repo.enviarMensaje(tenantId, remitenteId, remitenteNombre, input);
}
