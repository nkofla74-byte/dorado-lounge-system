import { describe, it, expect, vi } from 'vitest';
import { TurnoYaActivoError, TurnoNoActivoError } from '../domain/turno';
import { createTurno } from '../application/create-turno';
import { cerrarTurno } from '../application/cerrar-turno';
import type { TurnoRepository } from '../application/ports/turno-repository.port';
import type { Turno } from '../domain/turno';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeTurno(overrides: Partial<Turno> = {}): Turno {
  return {
    id: 'turno-1',
    tenantId: 'tenant-1',
    nombre: 'Turno mañana',
    teamlider: 'Ana García',
    responsableId: 'user-1',
    iniciadoAt: new Date('2026-05-04T06:00:00Z'),
    cerradoAt: null,
    activo: true,
    createdAt: new Date('2026-05-04T06:00:00Z'),
    updatedAt: new Date('2026-05-04T06:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<TurnoRepository> = {}): TurnoRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findActivo: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeTurno()),
    cerrar: vi.fn().mockResolvedValue(makeTurno({ activo: false, cerradoAt: new Date() })),
    ...overrides,
  };
}

// ── Errores de dominio ─────────────────────────────────────────────────────────

describe('TurnoYaActivoError', () => {
  it('tiene name correcto', () => {
    const error = new TurnoYaActivoError();
    expect(error.name).toBe('TurnoYaActivoError');
  });

  it('es instancia de Error', () => {
    expect(new TurnoYaActivoError()).toBeInstanceOf(Error);
  });

  it('mensaje indica que ya hay un turno activo', () => {
    const error = new TurnoYaActivoError();
    expect(error.message).toMatch(/turno activo/i);
  });
});

describe('TurnoNoActivoError', () => {
  it('tiene name correcto', () => {
    const error = new TurnoNoActivoError();
    expect(error.name).toBe('TurnoNoActivoError');
  });

  it('es instancia de Error', () => {
    expect(new TurnoNoActivoError()).toBeInstanceOf(Error);
  });

  it('mensaje indica que el turno está cerrado', () => {
    const error = new TurnoNoActivoError();
    expect(error.message).toMatch(/cerrado/i);
  });
});

// ── createTurno ────────────────────────────────────────────────────────────────

describe('createTurno', () => {
  it('crea un turno cuando no hay ninguno activo', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(null) });
    const turno = await createTurno(repo, 'tenant-1', 'Turno tarde', 'Ana García', 'user-1');
    expect(repo.create).toHaveBeenCalledWith('tenant-1', 'Turno tarde', 'Ana García', 'user-1');
    expect(turno).toBeDefined();
  });

  it('lanza TurnoYaActivoError si ya existe un turno activo', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(makeTurno()) });
    await expect(
      createTurno(repo, 'tenant-1', 'Otro turno', 'Ana García', 'user-1'),
    ).rejects.toThrow(TurnoYaActivoError);
  });

  it('no llama a repo.create si hay turno activo', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(makeTurno()) });
    try {
      await createTurno(repo, 'tenant-1', 'Otro turno', 'Ana García', 'user-1');
    } catch {
      // esperado
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('pasa tenantId, nombre, teamlider y responsableId al repositorio', async () => {
    const repo = makeRepo();
    await createTurno(repo, 'mi-tenant', 'Turno noche', 'Luis Pérez', 'chef-99');
    expect(repo.create).toHaveBeenCalledWith('mi-tenant', 'Turno noche', 'Luis Pérez', 'chef-99');
  });

  it('devuelve el turno creado por el repositorio', async () => {
    const turnoCreado = makeTurno({ nombre: 'Turno especial' });
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(turnoCreado) });
    const result = await createTurno(repo, 'tenant-1', 'Turno especial', 'Ana García', 'user-1');
    expect(result).toBe(turnoCreado);
  });
});

// ── cerrarTurno ────────────────────────────────────────────────────────────────

describe('cerrarTurno', () => {
  it('cierra el turno activo cuando el ID coincide', async () => {
    const turnoActivo = makeTurno({ id: 'turno-abc' });
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(turnoActivo) });
    await cerrarTurno(repo, 'turno-abc', 'tenant-1');
    expect(repo.cerrar).toHaveBeenCalledWith('turno-abc', 'tenant-1');
  });

  it('lanza TurnoNoActivoError cuando no hay turno activo', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(null) });
    await expect(cerrarTurno(repo, 'turno-1', 'tenant-1')).rejects.toThrow(TurnoNoActivoError);
  });

  it('lanza TurnoNoActivoError cuando el ID no coincide con el turno activo', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(makeTurno({ id: 'turno-x' })) });
    await expect(cerrarTurno(repo, 'turno-distinto', 'tenant-1')).rejects.toThrow(
      TurnoNoActivoError,
    );
  });

  it('no llama a repo.cerrar si el ID no coincide', async () => {
    const repo = makeRepo({ findActivo: vi.fn().mockResolvedValue(makeTurno({ id: 'turno-x' })) });
    try {
      await cerrarTurno(repo, 'turno-distinto', 'tenant-1');
    } catch {
      // esperado
    }
    expect(repo.cerrar).not.toHaveBeenCalled();
  });

  it('devuelve el turno cerrado por el repositorio', async () => {
    const turnoCerrado = makeTurno({ activo: false, cerradoAt: new Date() });
    const repo = makeRepo({
      findActivo: vi.fn().mockResolvedValue(makeTurno({ id: 'turno-1' })),
      cerrar: vi.fn().mockResolvedValue(turnoCerrado),
    });
    const result = await cerrarTurno(repo, 'turno-1', 'tenant-1');
    expect(result).toBe(turnoCerrado);
  });
});
