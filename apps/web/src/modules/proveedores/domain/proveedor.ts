export interface Proveedor {
  id: string;
  tenantId: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProveedorInput {
  nombre: string;
  contacto?: string | null | undefined;
  telefono?: string | null | undefined;
  email?: string | null | undefined;
  notas?: string | null | undefined;
}

export interface UpdateProveedorInput {
  nombre?: string | undefined;
  contacto?: string | null | undefined;
  telefono?: string | null | undefined;
  email?: string | null | undefined;
  notas?: string | null | undefined;
  activo?: boolean | undefined;
}

export class ProveedorNotFoundError extends Error {
  override name = 'ProveedorNotFoundError' as const;
  constructor() {
    super('Proveedor no encontrado');
  }
}
