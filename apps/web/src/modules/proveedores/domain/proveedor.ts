export interface Proveedor {
  id: string;
  tenantId: string;
  tenantNombre: string | null;
  tenantSlug: string | null;
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

// Bloquea borrado cuando hay lotes activos referenciando al proveedor —
// el historial de compras debe mantenerse íntegro.
export class ProveedorEnUsoError extends Error {
  override name = 'ProveedorEnUsoError' as const;
  readonly lotesActivos: number;
  constructor(lotesActivos: number) {
    super(`No se puede borrar: el proveedor tiene ${lotesActivos} lote(s) activos referenciándolo`);
    this.lotesActivos = lotesActivos;
  }
}
