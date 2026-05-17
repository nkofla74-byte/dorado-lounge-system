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

// ── Reglas de severidad (puras) ───────────────────────────────────────────────

export const CAMBIO_PRECIO_UMBRAL_NOTIFICAR = 0.1;
export const CAMBIO_PRECIO_UMBRAL_CRITICO = 0.25;
export const DEMORA_AMEX_UMBRAL_CRITICO_MINS = 25;

export function severidadStockMinimo(stockActual: number): SeveridadAlerta {
  return stockActual === 0 ? 'critical' : 'warning';
}

/**
 * Devuelve la severidad de un cambio de precio o `null` si el cambio
 * relativo está por debajo del umbral de notificación.
 *
 * @param cambioRelativo Variación normalizada — `(nuevo - anterior) / anterior`.
 *   Puede venir con signo; se considera el valor absoluto.
 */
export function severidadCambioPrecio(cambioRelativo: number): SeveridadAlerta | null {
  const abs = Math.abs(cambioRelativo);
  if (abs < CAMBIO_PRECIO_UMBRAL_NOTIFICAR) return null;
  return abs >= CAMBIO_PRECIO_UMBRAL_CRITICO ? 'critical' : 'warning';
}

export function severidadVencimiento(diasRestantes: number): SeveridadAlerta {
  if (diasRestantes <= 0) return 'critical';
  if (diasRestantes <= 1) return 'warning';
  return 'info';
}

export function severidadDemoraAmex(minutosTranscurridos: number): SeveridadAlerta {
  return minutosTranscurridos >= DEMORA_AMEX_UMBRAL_CRITICO_MINS ? 'critical' : 'warning';
}
