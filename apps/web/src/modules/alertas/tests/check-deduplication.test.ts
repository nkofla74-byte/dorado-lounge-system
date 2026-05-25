import { describe, it, expect } from 'vitest';
import {
  severidadStockMinimo,
  severidadVencimiento,
  severidadDemoraAmex,
  severidadCambioPrecio,
  CAMBIO_PRECIO_UMBRAL_NOTIFICAR,
  CAMBIO_PRECIO_UMBRAL_CRITICO,
  DEMORA_AMEX_UMBRAL_CRITICO_MINS,
} from '../domain/alerta';
import type { TipoAlerta, SeveridadAlerta } from '../domain/alerta';

interface StoredAlerta {
  id: string;
  tenantId: string;
  tipo: TipoAlerta;
  resourceId: string | null;
  leida: boolean;
  createdAt: Date;
}

function createAlertaDeduplicator() {
  const alertas: StoredAlerta[] = [];
  let counter = 0;

  function crearAlerta(
    tenantId: string,
    tipo: TipoAlerta,
    resourceId: string | null,
    windowMs: number,
  ): StoredAlerta | null {
    const windowStart = new Date(Date.now() - windowMs);
    const existing = alertas.find(
      (a) =>
        a.tenantId === tenantId &&
        a.tipo === tipo &&
        a.resourceId === resourceId &&
        !a.leida &&
        a.createdAt >= windowStart,
    );
    if (existing) return null;

    counter++;
    const alerta: StoredAlerta = {
      id: `alerta-${counter}`,
      tenantId,
      tipo,
      resourceId,
      leida: false,
      createdAt: new Date(),
    };
    alertas.push(alerta);
    return alerta;
  }

  function marcarLeida(id: string) {
    const a = alertas.find((a) => a.id === id);
    if (a) a.leida = true;
  }

  return { alertas, crearAlerta, marcarLeida };
}

describe('Deduplicación de alertas — cron checks', () => {
  it('no genera alerta duplicada dentro de la ventana de tiempo', () => {
    const dedup = createAlertaDeduplicator();
    const windowMs = 4 * 60 * 60 * 1000;

    const first = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs);
    const second = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(dedup.alertas).toHaveLength(1);
  });

  it('genera alerta para recursos distintos del mismo tipo', () => {
    const dedup = createAlertaDeduplicator();
    const windowMs = 4 * 60 * 60 * 1000;

    const a1 = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs);
    const a2 = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-2', windowMs);

    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect(dedup.alertas).toHaveLength(2);
  });

  it('genera nueva alerta después de que la anterior fue leída', () => {
    const dedup = createAlertaDeduplicator();
    const windowMs = 4 * 60 * 60 * 1000;

    const first = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs)!;
    dedup.marcarLeida(first.id);

    const second = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs);
    expect(second).not.toBeNull();
    expect(dedup.alertas).toHaveLength(2);
  });

  it('aislamiento de tenant: misma alerta permitida en tenants distintos', () => {
    const dedup = createAlertaDeduplicator();
    const windowMs = 4 * 60 * 60 * 1000;

    const a1 = dedup.crearAlerta('tenant-A', 'stock_minimo', 'insumo-1', windowMs);
    const a2 = dedup.crearAlerta('tenant-B', 'stock_minimo', 'insumo-1', windowMs);

    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
  });

  it('tipos distintos para el mismo recurso generan alertas separadas', () => {
    const dedup = createAlertaDeduplicator();
    const windowMs = 4 * 60 * 60 * 1000;

    const a1 = dedup.crearAlerta('t1', 'stock_minimo', 'insumo-1', windowMs);
    const a2 = dedup.crearAlerta('t1', 'vencimiento', 'insumo-1', windowMs);

    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect(dedup.alertas).toHaveLength(2);
  });

  it('demora AMEX: ventana de 1h permite re-alertar tras expiración', () => {
    const dedup = createAlertaDeduplicator();

    const first = dedup.crearAlerta('t1', 'demora_amex', 'pedido-1', 60 * 60 * 1000);
    expect(first).not.toBeNull();

    const firstAlerta = dedup.alertas[0]!;
    firstAlerta.createdAt = new Date(Date.now() - 61 * 60 * 1000);

    const second = dedup.crearAlerta('t1', 'demora_amex', 'pedido-1', 60 * 60 * 1000);
    expect(second).not.toBeNull();
    expect(dedup.alertas).toHaveLength(2);
  });
});

describe('Severidad de alertas — reglas de dominio', () => {
  it('stock en 0 es critical, mayor a 0 es warning', () => {
    expect(severidadStockMinimo(0)).toBe('critical');
    expect(severidadStockMinimo(0.5)).toBe('warning');
    expect(severidadStockMinimo(100)).toBe('warning');
  });

  it('vencimiento: vencido = critical, 1 día = warning, 2+ = info', () => {
    expect(severidadVencimiento(-1)).toBe('critical');
    expect(severidadVencimiento(0)).toBe('critical');
    expect(severidadVencimiento(1)).toBe('warning');
    expect(severidadVencimiento(2)).toBe('info');
    expect(severidadVencimiento(5)).toBe('info');
  });

  it('demora AMEX: >= 25min es critical, menor es warning', () => {
    expect(severidadDemoraAmex(DEMORA_AMEX_UMBRAL_CRITICO_MINS)).toBe('critical');
    expect(severidadDemoraAmex(30)).toBe('critical');
    expect(severidadDemoraAmex(15)).toBe('warning');
    expect(severidadDemoraAmex(24)).toBe('warning');
  });

  it('cambio de precio: < 10% no notifica, 10-25% warning, >= 25% critical', () => {
    expect(severidadCambioPrecio(0.05)).toBeNull();
    expect(severidadCambioPrecio(-0.05)).toBeNull();
    expect(severidadCambioPrecio(CAMBIO_PRECIO_UMBRAL_NOTIFICAR)).toBe('warning');
    expect(severidadCambioPrecio(0.2)).toBe('warning');
    expect(severidadCambioPrecio(CAMBIO_PRECIO_UMBRAL_CRITICO)).toBe('critical');
    expect(severidadCambioPrecio(-0.3)).toBe('critical');
  });
});
