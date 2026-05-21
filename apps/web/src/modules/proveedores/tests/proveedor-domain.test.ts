import { describe, it, expect, vi } from 'vitest';
import { ProveedorNotFoundError } from '../domain/proveedor';
import type { Proveedor } from '../domain/proveedor';
import type { ProveedorRepository } from '../application/ports/proveedor-repository.port';
import { createProveedor } from '../application/create-proveedor';
import { getProveedores } from '../application/get-proveedores';
import { updateProveedor } from '../application/update-proveedor';

// ── Factories ──────────────────────────────────────────────────────────────────

function makeProveedor(overrides: Partial<Proveedor> = {}): Proveedor {
  return {
    id: 'prov-1',
    tenantId: 'tenant-1',
    tenantNombre: null,
    tenantSlug: null,
    nombre: 'Distribuidora La Cosecha',
    contacto: null,
    telefono: null,
    email: null,
    notas: null,
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<ProveedorRepository> = {}): ProveedorRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(makeProveedor()),
    update: vi.fn().mockResolvedValue(makeProveedor()),
    findLotesByProveedor: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── ProveedorNotFoundError ────────────────────────────────────────────────────

describe('ProveedorNotFoundError', () => {
  it('es instancia de Error', () => {
    expect(new ProveedorNotFoundError()).toBeInstanceOf(Error);
  });

  it('tiene name correcto', () => {
    expect(new ProveedorNotFoundError().name).toBe('ProveedorNotFoundError');
  });

  it('tiene mensaje en español', () => {
    expect(new ProveedorNotFoundError().message).toBe('Proveedor no encontrado');
  });
});

// ── createProveedor (use case) ────────────────────────────────────────────────

describe('createProveedor', () => {
  it('delega al repo.create con tenantId y el input', async () => {
    const repo = makeRepo();
    const input = { nombre: 'Nuevo proveedor', email: 'contacto@nuevo.com' };
    await createProveedor(repo, 'tenant-1', input);
    expect(repo.create).toHaveBeenCalledWith('tenant-1', input);
  });

  it('devuelve el proveedor creado por el repositorio', async () => {
    const proveedor = makeProveedor({ nombre: 'Otro' });
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(proveedor) });
    const result = await createProveedor(repo, 'tenant-1', { nombre: 'Otro' });
    expect(result).toBe(proveedor);
  });

  it('acepta input mínimo (solo nombre)', async () => {
    const repo = makeRepo();
    await createProveedor(repo, 'tenant-1', { nombre: 'Mínimo' });
    expect(repo.create).toHaveBeenCalledWith('tenant-1', { nombre: 'Mínimo' });
  });
});

// ── getProveedores (use case) ─────────────────────────────────────────────────

describe('getProveedores', () => {
  it('delega al repo.findAll con tenantId', async () => {
    const repo = makeRepo();
    await getProveedores(repo, 'tenant-1');
    expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
  });

  it('devuelve la lista completa retornada por el repositorio', async () => {
    const proveedores = [makeProveedor(), makeProveedor({ id: 'prov-2', nombre: 'Otro' })];
    const repo = makeRepo({ findAll: vi.fn().mockResolvedValue(proveedores) });
    const result = await getProveedores(repo, 'tenant-1');
    expect(result).toBe(proveedores);
    expect(result).toHaveLength(2);
  });

  it('devuelve lista vacía cuando no hay proveedores', async () => {
    const repo = makeRepo({ findAll: vi.fn().mockResolvedValue([]) });
    expect(await getProveedores(repo, 'tenant-1')).toHaveLength(0);
  });
});

// ── updateProveedor (use case) ────────────────────────────────────────────────

describe('updateProveedor', () => {
  it('actualiza si el proveedor existe', async () => {
    const existing = makeProveedor();
    const updated = makeProveedor({ nombre: 'Nombre nuevo' });
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue(updated),
    });

    const result = await updateProveedor(repo, 'prov-1', 'tenant-1', { nombre: 'Nombre nuevo' });

    expect(repo.findById).toHaveBeenCalledWith('prov-1', 'tenant-1');
    expect(repo.update).toHaveBeenCalledWith('prov-1', 'tenant-1', { nombre: 'Nombre nuevo' });
    expect(result).toBe(updated);
  });

  it('lanza ProveedorNotFoundError si el proveedor no existe', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    await expect(updateProveedor(repo, 'no-existe', 'tenant-1', { nombre: 'X' })).rejects.toThrow(
      ProveedorNotFoundError,
    );
  });

  it('no llama a repo.update si el proveedor no existe', async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    await expect(updateProveedor(repo, 'no-existe', 'tenant-1', { nombre: 'X' })).rejects.toThrow(
      ProveedorNotFoundError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('respeta el aislamiento por tenant (consulta findById con tenantId)', async () => {
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(makeProveedor({ tenantId: 'tenant-A' })),
    });
    await updateProveedor(repo, 'prov-1', 'tenant-A', { activo: false });
    expect(repo.findById).toHaveBeenCalledWith('prov-1', 'tenant-A');
  });
});
