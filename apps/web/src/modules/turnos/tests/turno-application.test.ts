import { describe, it, expect } from 'vitest';
import { createTurno } from '../application/create-turno';
import { cerrarTurno } from '../application/cerrar-turno';
import { TurnoYaActivoError, TurnoNoActivoError } from '../domain/turno';
import type { Turno, TurnoBloque } from '../domain/turno';
import type { TurnoRepository } from '../application/ports/turno-repository.port';

function makeTurno(overrides: Partial<Turno> = {}): Turno {
  return {
    id: 'turno-1',
    tenantId: 'tenant-1',
    nombre: 'Turno mañana',
    bloque: '6a2',
    teamlider: 'Juan',
    responsableId: 'user-1',
    iniciadoAt: new Date(),
    cerradoAt: null,
    cierreMotivo: null,
    activo: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createInMemoryRepo(): TurnoRepository & { turnos: Turno[] } {
  const turnos: Turno[] = [];
  let counter = 0;

  return {
    turnos,
    async findAll(tenantId: string) {
      return turnos.filter((t) => t.tenantId === tenantId);
    },
    async findActivo(tenantId: string) {
      return turnos.find((t) => t.tenantId === tenantId && t.activo) ?? null;
    },
    async findActivoByUser(tenantId: string, responsableId: string) {
      return (
        turnos.find(
          (t) => t.tenantId === tenantId && t.responsableId === responsableId && t.activo,
        ) ?? null
      );
    },
    async findActivosEnBloque(tenantId: string, bloque: TurnoBloque) {
      return turnos.filter((t) => t.tenantId === tenantId && t.bloque === bloque && t.activo);
    },
    async create(tenantId: string, bloque: TurnoBloque, teamlider: string, responsableId: string) {
      counter++;
      const t = makeTurno({
        id: `turno-${counter}`,
        tenantId,
        bloque,
        teamlider,
        responsableId,
      });
      turnos.push(t);
      return t;
    },
    async cerrar(turnoId: string, tenantId: string) {
      const idx = turnos.findIndex((t) => t.id === turnoId && t.tenantId === tenantId);
      if (idx === -1) throw new Error('NOT_FOUND');
      turnos[idx] = {
        ...turnos[idx]!,
        activo: false,
        cerradoAt: new Date(),
        cierreMotivo: 'manual',
      };
      return turnos[idx]!;
    },
  };
}

describe('createTurno — application', () => {
  it('crea turno si el usuario no tiene uno activo', async () => {
    const repo = createInMemoryRepo();
    const turno = await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');
    expect(turno.activo).toBe(true);
    expect(turno.bloque).toBe('6a2');
    expect(turno.teamlider).toBe('Juan');
    expect(turno.responsableId).toBe('user-1');
  });

  it('rechaza si el usuario ya tiene un turno activo', async () => {
    const repo = createInMemoryRepo();
    await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');

    await expect(createTurno(repo, 'tenant-1', '2a10', 'Juan', 'user-1')).rejects.toThrow(
      TurnoYaActivoError,
    );
  });

  it('permite que dos usuarios distintos tengan turnos simultáneos', async () => {
    const repo = createInMemoryRepo();
    await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');
    const t2 = await createTurno(repo, 'tenant-1', '6a2', 'María', 'user-2');
    expect(t2.responsableId).toBe('user-2');
    expect(repo.turnos).toHaveLength(2);
  });

  it('permite turno en otro tenant aunque el usuario exista en ambos', async () => {
    const repo = createInMemoryRepo();
    await createTurno(repo, 'tenant-A', '6a2', 'Juan', 'user-1');
    const t2 = await createTurno(repo, 'tenant-B', '6a2', 'Juan', 'user-1');
    expect(t2.tenantId).toBe('tenant-B');
  });
});

describe('cerrarTurno — application', () => {
  it('cierra el turno activo del usuario', async () => {
    const repo = createInMemoryRepo();
    const turno = await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');
    const cerrado = await cerrarTurno(repo, turno.id, 'tenant-1', 'user-1');
    expect(cerrado.activo).toBe(false);
    expect(cerrado.cerradoAt).not.toBeNull();
  });

  it('rechaza si el usuario no tiene turno activo', async () => {
    const repo = createInMemoryRepo();
    await expect(cerrarTurno(repo, 'turno-999', 'tenant-1', 'user-1')).rejects.toThrow(
      TurnoNoActivoError,
    );
  });

  it('rechaza si el turnoId no coincide con el turno activo del usuario', async () => {
    const repo = createInMemoryRepo();
    await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');
    await expect(cerrarTurno(repo, 'turno-wrong', 'tenant-1', 'user-1')).rejects.toThrow(
      TurnoNoActivoError,
    );
  });

  it('después de cerrar, el usuario puede abrir uno nuevo', async () => {
    const repo = createInMemoryRepo();
    const t1 = await createTurno(repo, 'tenant-1', '6a2', 'Juan', 'user-1');
    await cerrarTurno(repo, t1.id, 'tenant-1', 'user-1');
    const t2 = await createTurno(repo, 'tenant-1', '2a10', 'Juan', 'user-1');
    expect(t2.activo).toBe(true);
    expect(t2.id).not.toBe(t1.id);
  });
});
