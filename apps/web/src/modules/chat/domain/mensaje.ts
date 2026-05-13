import type { Channel } from '@dorado/shared-types';

export type TipoMensaje = 'text' | 'image' | 'alert' | 'broadcast';

export interface Mensaje {
  id: string;
  tenantId: string;
  canal: Channel;
  remitenteId: string;
  remitenteNombre: string;
  contenido: string;
  tipo: TipoMensaje;
  createdAt: Date;
}

export interface EnviarMensajeInput {
  canal: Channel;
  contenido: string;
  tipo?: TipoMensaje;
}

export function validarContenido(contenido: string): boolean {
  const trimmed = contenido.trim();
  return trimmed.length > 0 && trimmed.length <= 1000;
}
