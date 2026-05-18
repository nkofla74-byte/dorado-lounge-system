import { describe, expect, it, vi } from 'vitest';
import { validarClave } from '../domain/feature-flag';
import { createFeatureFlag } from '../application/create-feature-flag';
import { setFeatureFlag } from '../application/set-feature-flag';
import { AppError } from '@/lib/result';
import type { FeatureFlagRepository } from '../application/ports/feature-flag-repository.port';
import type { FeatureFlag } from '../domain/feature-flag';

describe('feature-flag domain — validarClave', () => {
  it('acepta una sola letra minúscula', () => {
    expect(validarClave('a')).toBe(true);
    expect(validarClave('z')).toBe(true);
  });

  it('acepta snake_case válido', () => {
    expect(validarClave('quick_orders_enabled')).toBe(true);
    expect(validarClave('feature_42')).toBe(true);
    expect(validarClave('amex_kds_v2')).toBe(true);
  });

  it('rechaza claves que empiezan con número', () => {
    expect(validarClave('2_fast')).toBe(false);
    expect(validarClave('_underscore')).toBe(false);
  });

  it('rechaza mayúsculas', () => {
    expect(validarClave('MyFlag')).toBe(false);
    expect(validarClave('CAPS')).toBe(false);
  });

  it('rechaza guiones, espacios y caracteres especiales', () => {
    expect(validarClave('my-flag')).toBe(false);
    expect(validarClave('my flag')).toBe(false);
    expect(validarClave('my.flag')).toBe(false);
    expect(validarClave('café')).toBe(false);
  });

  it('rechaza claves que terminan en underscore', () => {
    expect(validarClave('my_flag_')).toBe(false);
  });

  it('rechaza claves vacías', () => {
    expect(validarClave('')).toBe(false);
  });

  it('rechaza claves de más de 64 caracteres', () => {
    expect(validarClave('a'.repeat(64))).toBe(true);
    expect(validarClave('a'.repeat(65))).toBe(false);
  });
});

describe('feature-flag application — createFeatureFlag', () => {
  function makeRepo(): FeatureFlagRepository {
    const stored: FeatureFlag = {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: 't1',
      clave: 'demo',
      valor: false,
      descripcion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return {
      create: vi.fn(async (input, tenantId) => ({ ...stored, clave: input.clave, tenantId })),
      getAll: vi.fn(async () => [stored]),
      set: vi.fn(async (clave, valor, tenantId) => ({ ...stored, clave, valor, tenantId })),
    };
  }

  it('crea el flag cuando la clave es válida', async () => {
    const repo = makeRepo();
    const result = await createFeatureFlag(repo, 't1', { clave: 'snack_v2' });
    expect(result.clave).toBe('snack_v2');
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('rechaza con AppError VALIDATION cuando la clave es inválida', async () => {
    const repo = makeRepo();
    await expect(createFeatureFlag(repo, 't1', { clave: 'BAD-KEY' })).rejects.toThrow(AppError);
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('feature-flag application — setFeatureFlag', () => {
  function makeRepo(): FeatureFlagRepository {
    const stored: FeatureFlag = {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: 't1',
      clave: 'demo',
      valor: false,
      descripcion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return {
      create: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(async (clave, valor, tenantId) => ({ ...stored, clave, valor, tenantId })),
    };
  }

  it('actualiza el valor para una clave existente', async () => {
    const repo = makeRepo();
    const result = await setFeatureFlag(repo, 't1', 'demo', true);
    expect(result.valor).toBe(true);
  });

  it('rechaza claves vacías o solo espacios', async () => {
    const repo = makeRepo();
    await expect(setFeatureFlag(repo, 't1', '', true)).rejects.toThrow(AppError);
    await expect(setFeatureFlag(repo, 't1', '   ', false)).rejects.toThrow(AppError);
    expect(repo.set).not.toHaveBeenCalled();
  });
});
