import { describe, it, expect } from 'vitest';
import { EstadoRequisicion, REQUISICION_TRANSITIONS, CHANNELS, CHANNEL_ACL } from '../index';

describe('requisiciones — contratos', () => {
  it('la máquina de estados solo permite el flujo solicitada→…→recibida', () => {
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.solicitada]).toEqual([
      'en_alistamiento',
      'cancelada',
    ]);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.en_alistamiento]).toEqual(['despachada']);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.despachada]).toEqual(['recibida']);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.recibida]).toEqual([]);
    expect(REQUISICION_TRANSITIONS[EstadoRequisicion.cancelada]).toEqual([]);
  });

  it('cancelar solo es válido desde solicitada', () => {
    const cancelables = Object.entries(REQUISICION_TRANSITIONS)
      .filter(([, next]) => next.includes('cancelada'))
      .map(([estado]) => estado);
    expect(cancelables).toEqual(['solicitada']);
  });

  it('sala:almacen existe y solo la pueden unir almacén/admin/superuser', () => {
    expect(CHANNELS.ALMACEN).toBe('sala:almacen');
    expect(CHANNEL_ACL['sala:almacen']).toEqual(['personal_almacen', 'admin', 'superuser']);
  });
});
