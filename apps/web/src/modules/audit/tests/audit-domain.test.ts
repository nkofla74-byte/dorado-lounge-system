import { describe, expect, it } from 'vitest';
import type { AuditEntry, AuditFilters } from '../domain/audit-entry';

// El módulo audit no expone lógica de dominio (interfaces puras).
// El hash chain SHA-256 y la inmutabilidad están en Postgres
// (migración 0002 — triggers que bloquean UPDATE/DELETE).
//
// Estos tests son smoke checks para detectar rupturas del contract
// si alguien modifica el shape del tipo.

describe('audit domain — AuditEntry shape', () => {
  it('acepta una entry completa con prev_hash y hash de hash chain', () => {
    const entry: AuditEntry = {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      tenantNombre: 'Dorado Lounge',
      tenantSlug: 'dorado-lounge',
      userId: '00000000-0000-0000-0000-000000000003',
      userNombre: 'Test User',
      action: 'pedido.created',
      resourceType: 'pedido',
      resourceId: '00000000-0000-0000-0000-000000000004',
      payload: { mesa: 'A3', items: 2 },
      ipAddress: '192.0.2.1',
      prevHash: 'a'.repeat(64),
      hash: 'b'.repeat(64),
      createdAt: new Date('2026-05-17T14:00:00Z'),
    };
    expect(entry.action).toBe('pedido.created');
    expect(entry.payload['mesa']).toBe('A3');
    expect(entry.hash).toHaveLength(64);
  });

  it('acepta entries de sistema sin user/tenant (nulls)', () => {
    const entry: AuditEntry = {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: null,
      tenantNombre: null,
      tenantSlug: null,
      userId: null,
      userNombre: null,
      action: 'system.heartbeat',
      resourceType: null,
      resourceId: null,
      payload: {},
      ipAddress: null,
      prevHash: null,
      hash: 'c'.repeat(64),
      createdAt: new Date(),
    };
    expect(entry.tenantId).toBeNull();
    expect(entry.userId).toBeNull();
  });
});

describe('audit domain — AuditFilters shape', () => {
  it('acepta filtros vacíos', () => {
    const filters: AuditFilters = {};
    expect(filters).toEqual({});
  });

  it('acepta rango de fechas + paginación', () => {
    const filters: AuditFilters = {
      action: 'pedido.created',
      desde: '2026-05-01',
      hasta: '2026-05-31',
      limit: 100,
      offset: 0,
    };
    expect(filters.limit).toBe(100);
    expect(filters.action).toBe('pedido.created');
  });
});
