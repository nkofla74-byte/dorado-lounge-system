import type { ChatRepository } from './ports/chat-repository.port';
import type { Mensaje } from '../domain/mensaje';

export async function getMensajes(
  repo: ChatRepository,
  tenantId: string,
  canal: string,
  limit = 50,
): Promise<Mensaje[]> {
  return repo.getMensajes(tenantId, canal, limit);
}
