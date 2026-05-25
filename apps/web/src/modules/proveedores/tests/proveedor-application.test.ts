import { describe, it, expect } from 'vitest';
import { createProveedor } from '../application/create-proveedor';
import { deleteProveedor } from '../application/delete-proveedor';
import { ProveedorNotFoundError, ProveedorEnUsoError } from '../domain/proveedor';
import type { Proveedor, CreateProveedorInput, UpdateProveedorInput } from '../domain/proveedor';
import type {
  ProveedorRepository,
  LoteConInsumo,
} from '../application/ports/proveedor-repository.port';

function makeProveedor(overrides: Partial<Proveedor> = {}): Proveedor {
  return {
    id: 'prov-1',
    tenantId: 'tenant-1',
    tenantNombre: null,
    tenantSlug: null,
    nombre: 'Proveedor Test',
    contacto: null,
    telefono: null,
    email: null,
    notas: null,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createInMemoryRepo(): ProveedorRepository & {
  proveedores: Proveedor[];
  lotesCount: Map<string, number>;
} {
  const proveedores: Proveedor[] = [];
  const lotesCount = new Map<string, number>();
  let counter = 0;

  return {
    proveedores,
    lotesCount,
    async findAll(tenantId: string | null) {
      return proveedores.filter((p) => (tenantId === null || p.tenantId === tenantId) && p.activo);
    },
    async findById(id: string, tenantId: string | null) {
      return (
        proveedores.find(
          (p) => p.id === id && (tenantId === null || p.tenantId === tenantId) && p.activo,
        ) ?? null
      );
    },
    async create(tenantId: string, input: CreateProveedorInput) {
      counter++;
      const p = makeProveedor({
        id: `prov-${counter}`,
        tenantId,
        nombre: input.nombre,
        contacto: input.contacto ?? null,
        telefono: input.telefono ?? null,
        email: input.email ?? null,
        notas: input.notas ?? null,
      });
      proveedores.push(p);
      return p;
    },
    async update(id: string, tenantId: string | null, input: UpdateProveedorInput) {
      const idx = proveedores.findIndex(
        (p) => p.id === id && (tenantId === null || p.tenantId === tenantId),
      );
      if (idx === -1) throw new ProveedorNotFoundError();
      const current = proveedores[idx]!;
      proveedores[idx] = {
        ...current,
        nombre: input.nombre ?? current.nombre,
        contacto: input.contacto !== undefined ? (input.contacto ?? null) : current.contacto,
        telefono: input.telefono !== undefined ? (input.telefono ?? null) : current.telefono,
        email: input.email !== undefined ? (input.email ?? null) : current.email,
        notas: input.notas !== undefined ? (input.notas ?? null) : current.notas,
        activo: input.activo !== undefined ? input.activo : current.activo,
        updatedAt: new Date(),
      };
      return proveedores[idx]!;
    },
    async softDelete(id: string, tenantId: string | null) {
      const idx = proveedores.findIndex(
        (p) => p.id === id && (tenantId === null || p.tenantId === tenantId),
      );
      if (idx === -1) throw new ProveedorNotFoundError();
      proveedores[idx] = { ...proveedores[idx]!, activo: false };
    },
    async countActiveLotes(proveedorId: string) {
      return lotesCount.get(proveedorId) ?? 0;
    },
    async findLotesByProveedor(): Promise<LoteConInsumo[]> {
      return [];
    },
  };
}

describe('createProveedor — application', () => {
  it('crea proveedor con datos mínimos', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', { nombre: 'Avícola BOG' });
    expect(prov.nombre).toBe('Avícola BOG');
    expect(prov.tenantId).toBe('tenant-1');
    expect(prov.activo).toBe(true);
  });

  it('crea proveedor con datos completos', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', {
      nombre: 'Carnes SA',
      contacto: 'Pedro',
      telefono: '+573001234567',
      email: 'pedro@carnes.co',
      notas: 'Entrega martes y viernes',
    });
    expect(prov.contacto).toBe('Pedro');
    expect(prov.email).toBe('pedro@carnes.co');
  });
});

describe('deleteProveedor — application', () => {
  it('borra proveedor sin lotes activos', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', { nombre: 'Temp' });
    await deleteProveedor(repo, prov.id, 'tenant-1');
    expect(repo.proveedores.find((p) => p.id === prov.id)!.activo).toBe(false);
  });

  it('rechaza borrado si tiene lotes activos', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', { nombre: 'Con Lotes' });
    repo.lotesCount.set(prov.id, 3);

    await expect(deleteProveedor(repo, prov.id, 'tenant-1')).rejects.toThrow(ProveedorEnUsoError);
    expect(repo.proveedores.find((p) => p.id === prov.id)!.activo).toBe(true);
  });

  it('el error de ProveedorEnUsoError incluye la cantidad de lotes', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', { nombre: 'Test' });
    repo.lotesCount.set(prov.id, 7);

    try {
      await deleteProveedor(repo, prov.id, 'tenant-1');
      expect.fail('Debió lanzar ProveedorEnUsoError');
    } catch (e) {
      expect(e).toBeInstanceOf(ProveedorEnUsoError);
      expect((e as ProveedorEnUsoError).lotesActivos).toBe(7);
    }
  });

  it('rechaza borrado de proveedor inexistente', async () => {
    const repo = createInMemoryRepo();
    await expect(deleteProveedor(repo, 'prov-999', 'tenant-1')).rejects.toThrow(
      ProveedorNotFoundError,
    );
  });

  it('superuser puede borrar con tenantId=null', async () => {
    const repo = createInMemoryRepo();
    const prov = await createProveedor(repo, 'tenant-1', { nombre: 'Global' });
    await deleteProveedor(repo, prov.id, null);
    expect(repo.proveedores.find((p) => p.id === prov.id)!.activo).toBe(false);
  });
});
