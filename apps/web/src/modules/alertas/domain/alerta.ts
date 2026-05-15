export type TipoAlerta = 'stock_minimo' | 'vencimiento' | 'cambio_precio' | 'demora_amex';
export type SeveridadAlerta = 'info' | 'warning' | 'critical';
export type ResourceTipoAlerta = 'insumo' | 'lote' | 'pedido';

export interface Alerta {
  id: string;
  tenantId: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  titulo: string;
  mensaje: string;
  resourceId: string | null;
  resourceTipo: ResourceTipoAlerta | null;
  leida: boolean;
  leidaAt: Date | null;
  createdAt: Date;
}

export interface CreateAlertaInput {
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  titulo: string;
  mensaje: string;
  resourceId?: string | null;
  resourceTipo?: ResourceTipoAlerta | null;
}
