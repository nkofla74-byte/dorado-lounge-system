import { describe, it, expect, vi } from 'vitest';
import { validarIngreso, IngresoInvalidoError } from '../domain/afluencia';
import { registrarIngreso } from '../application/registrar-ingreso';
import { getAfluenciaByTurno, getTotalPasajeros } from '../application/get-afluencia';
import type { AfluenciaIngreso, RegistrarIngresoInput } from '../domain/afluencia';
import type { AfluenciaRepository } from '../application/ports/afluencia-repository.port';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeIngreso(overrides: Partial<AfluenciaIngreso> = {}): AfluenciaIngreso {
  return {
    id: 'ing-1',
    tenantId: 'tenant-1',
    turnoId: 'turno-1',
    cantidad: 15,
    zona: null,
    registradoPor: 'user-1',
    vueloNumero: 'AV101',
    ingresadoAt: new Date('2026-05-04T09:00:00Z'),
    createdAt: new Date('2026-05-04T09:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<AfluenciaRepository> = {}): AfluenciaRepository {
  return {
    findByTurno: vi.fn().mockResolvedValue([]),
    getTotalByTurno: vi.fn().mockResolvedValue(0),
    findByBloqueHoy: vi.fn().mockResolvedValue([]),
    getTotalByBloqueHoy: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(makeIngreso()),
    findPasajerosByTurno: vi.fn().mockResolvedValue([]),
    getTotalPasajerosByTurno: vi.fn().mockResolvedValue(0),
    createPasajero: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ── validarIngreso — función pura ─────────────────────────────────────────────

describe('validarIngreso', () => {
  it('acepta cantidad entera positiva', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 1 })).not.toThrow();
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 100 })).not.toThrow();
  });

  it('lanza IngresoInvalidoError si cantidad es cero', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 0 })).toThrow(IngresoInvalidoError);
  });

  it('lanza IngresoInvalidoError si cantidad es negativa', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: -5 })).toThrow(IngresoInvalidoError);
  });

  it('lanza IngresoInvalidoError si cantidad no es entero', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 3.5 })).toThrow(IngresoInvalidoError);
  });

  it('acepta vueloNumero alfanumérico de hasta 10 caracteres', () => {
    expect(() =>
      validarIngreso({ turnoId: 't-1', cantidad: 5, vueloNumero: 'AV101' }),
    ).not.toThrow();
    expect(() =>
      validarIngreso({ turnoId: 't-1', cantidad: 5, vueloNumero: 'LA1234567A' }),
    ).not.toThrow();
  });

  it('lanza IngresoInvalidoError si vueloNumero es string vacío', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 5, vueloNumero: '' })).toThrow(
      IngresoInvalidoError,
    );
  });

  it('lanza IngresoInvalidoError si vueloNumero supera 10 caracteres', () => {
    expect(() =>
      validarIngreso({ turnoId: 't-1', cantidad: 5, vueloNumero: 'AV12345678X' }),
    ).toThrow(IngresoInvalidoError);
  });

  it('acepta vueloNumero null (vuelo desconocido)', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: 5, vueloNumero: null })).not.toThrow();
  });

  it('el error informa el valor inválido recibido', () => {
    expect(() => validarIngreso({ turnoId: 't-1', cantidad: -3 })).toThrow('-3');
  });

  it('zona es opcional y acepta cualquiera de las 3 zonas', () => {
    const zonas = ['amex', 'snack', 'buffet'] as const;
    for (const zona of zonas) {
      expect(() => validarIngreso({ turnoId: 't-1', cantidad: 5, zona })).not.toThrow();
    }
  });
});

// ── IngresoInvalidoError ──────────────────────────────────────────────────────

describe('IngresoInvalidoError', () => {
  it('tiene name correcto', () => {
    expect(new IngresoInvalidoError('test').name).toBe('IngresoInvalidoError');
  });

  it('es instancia de Error', () => {
    expect(new IngresoInvalidoError('test')).toBeInstanceOf(Error);
  });

  it('preserva el mensaje', () => {
    expect(new IngresoInvalidoError('cantidad inválida').message).toBe('cantidad inválida');
  });
});

// ── registrarIngreso (use case) ───────────────────────────────────────────────

describe('registrarIngreso', () => {
  it('llama repo.create con los datos validados', async () => {
    const repo = makeRepo();
    const input: RegistrarIngresoInput = { turnoId: 'turno-1', cantidad: 20, zona: 'amex' };
    await registrarIngreso(repo, 'tenant-1', 'user-1', input);
    expect(repo.create).toHaveBeenCalledWith('tenant-1', 'user-1', input);
  });

  it('devuelve el ingreso creado por el repositorio', async () => {
    const ingreso = makeIngreso({ cantidad: 20 });
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(ingreso) });
    const result = await registrarIngreso(repo, 'tenant-1', 'user-1', {
      turnoId: 'turno-1',
      cantidad: 20,
    });
    expect(result).toBe(ingreso);
  });

  it('lanza IngresoInvalidoError antes de llamar al repo si cantidad inválida', async () => {
    const repo = makeRepo();
    await expect(
      registrarIngreso(repo, 'tenant-1', 'user-1', { turnoId: 'turno-1', cantidad: 0 }),
    ).rejects.toThrow(IngresoInvalidoError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('lanza IngresoInvalidoError para vuelo número vacío', async () => {
    const repo = makeRepo();
    await expect(
      registrarIngreso(repo, 'tenant-1', 'user-1', {
        turnoId: 'turno-1',
        cantidad: 5,
        vueloNumero: '',
      }),
    ).rejects.toThrow(IngresoInvalidoError);
  });
});

// ── getAfluenciaByTurno ───────────────────────────────────────────────────────

describe('getAfluenciaByTurno', () => {
  it('delega al repo con tenantId y turnoId', async () => {
    const ingresos = [makeIngreso(), makeIngreso({ id: 'ing-2' })];
    const repo = makeRepo({ findByTurno: vi.fn().mockResolvedValue(ingresos) });
    const result = await getAfluenciaByTurno(repo, 'tenant-1', 'turno-1');
    expect(repo.findByTurno).toHaveBeenCalledWith('tenant-1', 'turno-1');
    expect(result).toBe(ingresos);
  });

  it('devuelve lista vacía si no hay ingresos en el turno', async () => {
    const repo = makeRepo({ findByTurno: vi.fn().mockResolvedValue([]) });
    const result = await getAfluenciaByTurno(repo, 'tenant-1', 'turno-nuevo');
    expect(result).toHaveLength(0);
  });
});

// ── getTotalPasajeros ─────────────────────────────────────────────────────────

describe('getTotalPasajeros', () => {
  it('delega al repo con tenantId y turnoId', async () => {
    const repo = makeRepo({ getTotalByTurno: vi.fn().mockResolvedValue(87) });
    const total = await getTotalPasajeros(repo, 'tenant-1', 'turno-1');
    expect(repo.getTotalByTurno).toHaveBeenCalledWith('tenant-1', 'turno-1');
    expect(total).toBe(87);
  });

  it('devuelve 0 para turno sin ingresos registrados', async () => {
    const repo = makeRepo({ getTotalByTurno: vi.fn().mockResolvedValue(0) });
    const total = await getTotalPasajeros(repo, 'tenant-1', 'turno-vacio');
    expect(total).toBe(0);
  });

  it('total es siempre un entero no negativo', async () => {
    const repo = makeRepo({ getTotalByTurno: vi.fn().mockResolvedValue(243) });
    const total = await getTotalPasajeros(repo, 'tenant-1', 'turno-1');
    expect(total).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(total)).toBe(true);
  });
});
