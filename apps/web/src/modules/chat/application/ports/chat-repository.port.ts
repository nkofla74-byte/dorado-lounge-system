import type { Mensaje, EnviarMensajeInput } from '../../domain/mensaje';

export interface ChatRepository {
  getMensajes(tenantId: string, canal: string, limit?: number): Promise<Mensaje[]>;
  enviarMensaje(
    tenantId: string,
    remitenteId: string,
    remitenteNombre: string,
    input: EnviarMensajeInput,
  ): Promise<Mensaje>;
}
