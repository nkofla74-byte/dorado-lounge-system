import { describe, it, expect } from 'vitest';
import { CHANNELS, CHANNEL_ACL } from '../socket-events';
import { UserRole } from '../enums';
import type { Channel } from '../socket-events';

describe('CHANNELS', () => {
  it('todos los valores empiezan con "sala:"', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(channel).toMatch(/^sala:/);
    }
  });

  it('no hay canales duplicados', () => {
    const values = Object.values(CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('CHANNEL_ACL', () => {
  it('cada canal en CHANNELS tiene una entrada en CHANNEL_ACL', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(CHANNEL_ACL).toHaveProperty(channel);
    }
  });

  it('no hay canales en ACL que no existan en CHANNELS', () => {
    const channelValues = new Set(Object.values(CHANNELS));
    for (const aclChannel of Object.keys(CHANNEL_ACL)) {
      expect(channelValues.has(aclChannel as Channel)).toBe(true);
    }
  });

  it('cada ACL contiene solo roles válidos', () => {
    const validRoles = new Set(Object.values(UserRole));
    for (const [channel, roles] of Object.entries(CHANNEL_ACL)) {
      for (const role of roles) {
        expect(validRoles.has(role), `Rol inválido '${role}' en canal '${channel}'`).toBe(true);
      }
    }
  });

  it('admin y superuser tienen acceso a todos los canales', () => {
    for (const [channel, roles] of Object.entries(CHANNEL_ACL)) {
      expect(roles, `admin falta en ${channel}`).toContain('admin');
      expect(roles, `superuser falta en ${channel}`).toContain('superuser');
    }
  });

  it('sala:admin solo es accesible por admin y superuser', () => {
    expect(CHANNEL_ACL['sala:admin']).toEqual(['admin', 'superuser']);
  });

  it('mesero_amex puede acceder a sala:amex', () => {
    expect(CHANNEL_ACL['sala:amex']).toContain('mesero_amex');
  });

  it('no hay arrays vacíos en ACL', () => {
    for (const [channel, roles] of Object.entries(CHANNEL_ACL)) {
      expect(roles.length, `ACL vacío para ${channel}`).toBeGreaterThan(0);
    }
  });
});
