import { CHANNELS } from '@dorado/shared-types';
import type { Channel } from '@dorado/shared-types';
import type { TipoAlerta } from './alerta';

// Destinatarios de cada tipo de alerta (CLAUDE.md §Alertas).
//
// F-016 — Antes TODA alerta se difundía solo a CHANNELS.ADMIN, así que Almacén
// no recibía los avisos de vencimiento ni de stock mínimo —los que protegen el
// inventario perecedero— y el chef AMEX no recibía las demoras.
const CANALES_POR_TIPO: Record<TipoAlerta, readonly Channel[]> = {
  stock_minimo: [
    CHANNELS.ADMIN,
    CHANNELS.ALMACEN,
    CHANNELS.COCINA_FRIA,
    CHANNELS.COCINA_CALIENTE,
    CHANNELS.COCINA_AMEX,
  ],
  vencimiento: [CHANNELS.ADMIN, CHANNELS.ALMACEN],
  cambio_precio: [CHANNELS.ADMIN, CHANNELS.ALMACEN],
  demora_amex: [CHANNELS.ADMIN, CHANNELS.COCINA_AMEX, CHANNELS.AMEX],
  requisicion_demora: [CHANNELS.ADMIN, CHANNELS.ALMACEN],
};

export function canalesDeAlerta(tipo: TipoAlerta): readonly Channel[] {
  return CANALES_POR_TIPO[tipo] ?? [CHANNELS.ADMIN];
}
