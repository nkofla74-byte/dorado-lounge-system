import { describe, it, expect } from 'vitest';
import { CHANNELS } from '@dorado/shared-types';
import { canalesDeAlerta } from '../domain/canales';

// Regresión de F-016: toda alerta se difundía únicamente a CHANNELS.ADMIN, así
// que Almacén no recibía vencimientos ni stock mínimo —los avisos que protegen
// el inventario perecedero— y el chef AMEX no recibía las demoras.
describe('canalesDeAlerta', () => {
  it('lleva el stock mínimo a Admin, Almacén y las cocinas', () => {
    const canales = canalesDeAlerta('stock_minimo');
    expect(canales).toContain(CHANNELS.ADMIN);
    expect(canales).toContain(CHANNELS.ALMACEN);
    expect(canales).toContain(CHANNELS.COCINA_FRIA);
    expect(canales).toContain(CHANNELS.COCINA_CALIENTE);
  });

  it('lleva el vencimiento a Admin y Almacén', () => {
    expect(canalesDeAlerta('vencimiento')).toEqual([CHANNELS.ADMIN, CHANNELS.ALMACEN]);
  });

  it('lleva la demora AMEX al chef AMEX y a la zona', () => {
    const canales = canalesDeAlerta('demora_amex');
    expect(canales).toContain(CHANNELS.COCINA_AMEX);
    expect(canales).toContain(CHANNELS.AMEX);
  });

  it('lleva la demora de requisición a Almacén', () => {
    expect(canalesDeAlerta('requisicion_demora')).toContain(CHANNELS.ALMACEN);
  });

  it('siempre incluye a Admin', () => {
    const tipos = [
      'stock_minimo',
      'vencimiento',
      'cambio_precio',
      'demora_amex',
      'requisicion_demora',
    ] as const;
    for (const tipo of tipos) {
      expect(canalesDeAlerta(tipo)).toContain(CHANNELS.ADMIN);
    }
  });
});
